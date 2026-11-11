package contract

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// Identity dibaca dari sertifikat X.509 yang diterbitkan Fabric CA.
// Atribut clearance/jabatan/role ditanam saat enroll (lihat scripts/enroll-users.sh).
type Identity struct {
	ID        string
	Name      string
	MSP       string
	Clearance string
	Jabatan   string
	Role      string
}

func identify(ctx contractapi.TransactionContextInterface) (*Identity, error) {
	ci := ctx.GetClientIdentity()
	id, err := ci.GetID()
	if err != nil {
		return nil, fmt.Errorf("gagal membaca identitas: %w", err)
	}
	msp, err := ci.GetMSPID()
	if err != nil {
		return nil, err
	}
	cert, err := ci.GetX509Certificate()
	if err != nil {
		return nil, err
	}
	clr, _, _ := ci.GetAttributeValue("clearance")
	jab, _, _ := ci.GetAttributeValue("jabatan")
	role, _, _ := ci.GetAttributeValue("role")
	clr = strings.ToUpper(clr)
	if _, ok := levels[clr]; !ok {
		clr = "BIASA" // tanpa atribut => level terendah
	}
	return &Identity{
		ID:        id,
		Name:      cert.Subject.CommonName,
		MSP:       msp,
		Clearance: clr,
		Jabatan:   jab,
		Role:      strings.ToLower(role),
	}, nil
}

// QualifiedName menggabungkan MSP ID dan CN sertifikat. CN saja tidak unik
// lintas organisasi (tiap org punya CA sendiri), jadi disposisi mengacu ke
// pasangan MSP/CN.
func QualifiedName(msp, cn string) string {
	return msp + "/" + cn
}

// IsRecipient mengecek apakah identitas ada di daftar disposisi.
// Entri lama (sebelum RecipientIDs ada) hanya punya CN dan dicocokkan dengan CN.
func IsRecipient(doc *Document, who *Identity) bool {
	q := QualifiedName(who.MSP, who.Name)
	for i, cn := range doc.Recipients {
		if i < len(doc.RecipientIDs) && doc.RecipientIDs[i] != "" {
			if doc.RecipientIDs[i] == q {
				return true
			}
			continue
		}
		if cn == who.Name { // entri lama tanpa MSP
			return true
		}
	}
	return false
}

// CanAccess adalah aturan akses inti untuk membuka isi dokumen
// (pure function, mudah di-unit test).
//   - dokumen dicabut          => ditolak
//   - pemilik                  => selalu boleh
//   - clearance < klasifikasi  => ditolak
//   - SANGAT_RAHASIA           => wajib ada di daftar disposisi (need to know)
func CanAccess(doc *Document, who *Identity) (bool, string) {
	if doc.Revoked {
		return false, "dokumen sudah dicabut"
	}
	return needToKnow(doc, who)
}

// CanView menentukan siapa yang boleh melihat METADATA dokumen (nomor, hash,
// penerima, perihal) dan memverifikasi salinannya. Sama dengan CanAccess,
// ditambah auditor/admin, dan tetap berlaku untuk dokumen yang dicabut.
func CanView(doc *Document, who *Identity) (bool, string) {
	if who.Role == "auditor" || who.Role == "admin" {
		return true, "role " + who.Role
	}
	return needToKnow(doc, who)
}

func needToKnow(doc *Document, who *Identity) (bool, string) {
	if doc.Owner == who.ID {
		return true, "pemilik dokumen"
	}
	if levels[who.Clearance] < levels[doc.Klasifikasi] {
		return false, fmt.Sprintf("clearance %s < klasifikasi %s", who.Clearance, doc.Klasifikasi)
	}
	if doc.Klasifikasi == "SANGAT_RAHASIA" {
		if IsRecipient(doc, who) {
			return true, "penerima disposisi"
		}
		return false, "SANGAT_RAHASIA: tidak ada di daftar disposisi (need to know)"
	}
	return true, "clearance mencukupi"
}

// MatchVersion mencocokkan hash dengan versi terkini dan versi-versi lama.
func MatchVersion(doc *Document, hash string) *VerifyResult {
	if hash == doc.Hash {
		return &VerifyResult{Authentic: true, MatchedVersion: doc.Version, LatestVersion: doc.Version,
			Message: fmt.Sprintf("ASLI - cocok dengan versi terbaru (v%d)", doc.Version)}
	}
	for i, h := range doc.History {
		if h == hash {
			return &VerifyResult{Authentic: true, MatchedVersion: i + 1, LatestVersion: doc.Version,
				Message: fmt.Sprintf("ASLI - cocok dengan v%d (bukan versi terbaru, terbaru v%d)", i+1, doc.Version)}
		}
	}
	return &VerifyResult{LatestVersion: doc.Version, Message: "TIDAK COCOK - dokumen telah diubah atau bukan dokumen resmi"}
}

func loadWithIdentity(ctx contractapi.TransactionContextInterface, docID string) (string, *Document, *Identity, error) {
	key, doc, err := getDoc(ctx, docID)
	if err != nil {
		return "", nil, nil, err
	}
	who, err := identify(ctx)
	if err != nil {
		return "", nil, nil, err
	}
	return key, doc, who, nil
}

// deny mencatat ACCESS_DENIED + event, lalu mengembalikan Ok=false TANPA error
// supaya transaksi tetap di-commit ke ledger.
func deny(ctx contractapi.TransactionContextInterface, docID string, who *Identity, reason string) (*ActionResult, error) {
	if err := writeLog(ctx, docID, ActionAccessDenied, who, reason); err != nil {
		return nil, err
	}
	emitUnauthorized(ctx, docID, who, reason)
	return &ActionResult{Ok: false, Reason: reason}, nil
}

func docKey(ctx contractapi.TransactionContextInterface, docID string) (string, error) {
	return ctx.GetStub().CreateCompositeKey(docPrefix, []string{docID})
}

func getDoc(ctx contractapi.TransactionContextInterface, docID string) (string, *Document, error) {
	key, err := docKey(ctx, docID)
	if err != nil {
		return "", nil, err
	}
	b, err := ctx.GetStub().GetState(key)
	if err != nil {
		return "", nil, err
	}
	if b == nil {
		return "", nil, fmt.Errorf("dokumen %s tidak ditemukan", docID)
	}
	var d Document
	if err := json.Unmarshal(b, &d); err != nil {
		return "", nil, err
	}
	normalize(&d)
	return key, &d, nil
}

// normalize menyamakan panjang RecipientIDs dengan Recipients untuk dokumen
// yang dibuat sebelum field RecipientIDs ada.
func normalize(d *Document) {
	for len(d.RecipientIDs) < len(d.Recipients) {
		d.RecipientIDs = append(d.RecipientIDs, "")
	}
	if d.RecipientIDs == nil {
		d.RecipientIDs = []string{}
	}
}

func putDoc(ctx contractapi.TransactionContextInterface, key string, d *Document) error {
	b, err := json.Marshal(d)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, b)
}

// txTime memakai timestamp transaksi (deterministik di semua peer), bukan time.Now().
func txTime(ctx contractapi.TransactionContextInterface) (string, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return "", err
	}
	return ts.AsTime().UTC().Format(time.RFC3339), nil
}

func writeLog(ctx contractapi.TransactionContextInterface, docID, action string, who *Identity, detail string) error {
	txID := ctx.GetStub().GetTxID()
	key, err := ctx.GetStub().CreateCompositeKey(logPrefix, []string{docID, txID})
	if err != nil {
		return err
	}
	now, err := txTime(ctx)
	if err != nil {
		return err
	}
	b, err := json.Marshal(&AuditLog{
		DocType:   "auditlog",
		TxID:      txID,
		DocID:     docID,
		Action:    action,
		Actor:     who.Name,
		ActorOrg:  who.MSP,
		Clearance: who.Clearance,
		Jabatan:   who.Jabatan,
		Detail:    detail,
		Timestamp: now,
	})
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(key, b)
}

func emitUnauthorized(ctx contractapi.TransactionContextInterface, docID string, who *Identity, reason string) {
	payload, _ := json.Marshal(map[string]string{
		"docId":     docID,
		"actor":     who.Name,
		"org":       who.MSP,
		"clearance": who.Clearance,
		"jabatan":   who.Jabatan,
		"reason":    reason,
		"txId":      ctx.GetStub().GetTxID(),
	})
	_ = ctx.GetStub().SetEvent(EventUnauthorized, payload)
}

func queryLogs(ctx contractapi.TransactionContextInterface, attrs []string) ([]*AuditLog, error) {
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(logPrefix, attrs)
	if err != nil {
		return nil, err
	}
	defer it.Close()
	return collectLogs(it)
}

func collectLogs(it shim.StateQueryIteratorInterface) ([]*AuditLog, error) {
	out := []*AuditLog{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var l AuditLog
		if err := json.Unmarshal(kv.Value, &l); err != nil {
			return nil, err
		}
		out = append(out, &l)
	}
	return out, nil
}

func clampPage(n int32) int32 {
	if n <= 0 || n > MaxPageSize {
		return MaxPageSize
	}
	return n
}

// nextBookmark: halaman yang tidak penuh berarti data sudah habis.
func nextBookmark(fetched, pageSize int32, bookmark string) string {
	if fetched < pageSize {
		return ""
	}
	return bookmark
}
