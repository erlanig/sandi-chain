package contract

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// SandiContract: register, kontrol akses berbasis atribut (ABAC), verifikasi
// keaslian, disposisi, dan audit trail dokumen klasifikasi.
type SandiContract struct {
	contractapi.Contract
}

var hashRe = regexp.MustCompile(`^[a-f0-9]{64}$`)

// ---------------------------------------------------------------------------
// Transaksi (submit)
// ---------------------------------------------------------------------------

// RegisterDocument mendaftarkan dokumen baru. Hanya user dengan clearance
// >= klasifikasi yang boleh mendaftarkan. Percobaan dengan clearance kurang
// dicatat sebagai ACCESS_DENIED (Ok=false), bukan error.
func (c *SandiContract) RegisterDocument(ctx contractapi.TransactionContextInterface,
	docID, nomor, hash, klasifikasi string) (*ActionResult, error) {

	klasifikasi = strings.ToUpper(klasifikasi)
	if _, ok := levels[klasifikasi]; !ok {
		return nil, fmt.Errorf("klasifikasi tidak valid: %s", klasifikasi)
	}
	hash = strings.ToLower(hash)
	if !hashRe.MatchString(hash) {
		return nil, fmt.Errorf("hash harus SHA-256 hex (64 karakter)")
	}
	if strings.TrimSpace(docID) == "" {
		return nil, fmt.Errorf("docId wajib diisi")
	}

	key, err := docKey(ctx, docID)
	if err != nil {
		return nil, err
	}
	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("dokumen %s sudah terdaftar", docID)
	}

	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if levels[who.Clearance] < levels[klasifikasi] {
		return deny(ctx, docID, who, fmt.Sprintf("percobaan registrasi: clearance %s tidak cukup untuk dokumen %s", who.Clearance, klasifikasi))
	}

	now, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	doc := &Document{
		DocType:      "document",
		DocID:        docID,
		Nomor:        nomor,
		Hash:         hash,
		Klasifikasi:  klasifikasi,
		Owner:        who.ID,
		OwnerName:    who.Name,
		OwnerOrg:     who.MSP,
		Version:      1,
		History:      []string{},
		Recipients:   []string{},
		RecipientIDs: []string{},
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := putDoc(ctx, key, doc); err != nil {
		return nil, err
	}
	if err := writeLog(ctx, docID, ActionRegister, who, "v1 "+hash[:12]); err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]string{"docId": docID, "klasifikasi": klasifikasi, "actor": who.Name})
	_ = ctx.GetStub().SetEvent(EventRegistered, payload)
	return &ActionResult{Ok: true, Reason: "dokumen terdaftar", Document: doc}, nil
}

// AddVersion mencatat revisi dokumen. Hash lama masuk History supaya versi
// lama tetap bisa diverifikasi. Hanya pemilik.
func (c *SandiContract) AddVersion(ctx contractapi.TransactionContextInterface,
	docID, newHash string) (*ActionResult, error) {

	newHash = strings.ToLower(newHash)
	if !hashRe.MatchString(newHash) {
		return nil, fmt.Errorf("hash harus SHA-256 hex (64 karakter)")
	}
	key, doc, who, err := loadWithIdentity(ctx, docID)
	if err != nil {
		return nil, err
	}
	if doc.Owner != who.ID {
		return deny(ctx, docID, who, "percobaan revisi oleh non-pemilik")
	}
	if doc.Revoked {
		return deny(ctx, docID, who, "percobaan revisi dokumen yang sudah dicabut")
	}

	now, err := txTime(ctx)
	if err != nil {
		return nil, err
	}
	doc.History = append(doc.History, doc.Hash)
	doc.Hash = newHash
	doc.Version++
	doc.UpdatedAt = now
	if err := putDoc(ctx, key, doc); err != nil {
		return nil, err
	}
	if err := writeLog(ctx, docID, ActionNewVersion, who, fmt.Sprintf("v%d %s", doc.Version, newHash[:12])); err != nil {
		return nil, err
	}
	return &ActionResult{Ok: true, Reason: "versi baru tercatat", Document: doc}, nil
}

// RequestAccess mengecek hak akses dan SELALU mencatat hasilnya.
// Penolakan TIDAK dikembalikan sebagai error, karena error membatalkan
// transaksi dan log penolakannya ikut hilang.
func (c *SandiContract) RequestAccess(ctx contractapi.TransactionContextInterface,
	docID string) (*AccessResult, error) {

	_, doc, who, err := loadWithIdentity(ctx, docID)
	if err != nil {
		return nil, err
	}

	granted, reason := CanAccess(doc, who)
	if granted {
		if err := writeLog(ctx, docID, ActionAccessGrant, who, reason); err != nil {
			return nil, err
		}
		return &AccessResult{Granted: true, Reason: reason, Hash: doc.Hash, Version: doc.Version}, nil
	}

	if err := writeLog(ctx, docID, ActionAccessDenied, who, reason); err != nil {
		return nil, err
	}
	emitUnauthorized(ctx, docID, who, reason)
	return &AccessResult{Granted: false, Reason: reason}, nil
}

// VerifyDocument membandingkan hash file pembanding dengan ledger dan
// mencatat hasil verifikasinya.
func (c *SandiContract) VerifyDocument(ctx contractapi.TransactionContextInterface,
	docID, hash string) (*VerifyResult, error) {

	_, doc, who, err := loadWithIdentity(ctx, docID)
	if err != nil {
		return nil, err
	}
	// Tanpa cek ini, siapa pun bisa memakai verifikasi untuk memastikan
	// salinan bocor dokumen rahasia itu asli.
	if ok, reason := CanView(doc, who); !ok {
		reason = "percobaan verifikasi: " + reason
		if err := writeLog(ctx, docID, ActionAccessDenied, who, reason); err != nil {
			return nil, err
		}
		emitUnauthorized(ctx, docID, who, reason)
		return &VerifyResult{Denied: true, LatestVersion: 0, Message: reason}, nil
	}
	res := MatchVersion(doc, strings.ToLower(hash))

	action := ActionVerifyOK
	if !res.Authentic {
		action = ActionVerifyFail
		payload, _ := json.Marshal(map[string]string{
			"docId": docID, "actor": who.Name, "org": who.MSP, "hash": strings.ToLower(hash),
			"reason": res.Message, "txId": ctx.GetStub().GetTxID(),
		})
		_ = ctx.GetStub().SetEvent(EventTampered, payload)
	}
	return res, writeLog(ctx, docID, action, who, res.Message)
}

// AddDisposition memberi akses "need to know" ke personel tertentu, yang
// diidentifikasi dengan MSP ID + CN sertifikat. Wajib untuk dokumen
// SANGAT_RAHASIA. Hanya pemilik, dan tidak untuk dokumen yang dicabut.
func (c *SandiContract) AddDisposition(ctx contractapi.TransactionContextInterface,
	docID, recipient, recipientMsp, catatan string) (*ActionResult, error) {

	recipient = strings.TrimSpace(recipient)
	recipientMsp = strings.TrimSpace(recipientMsp)
	if recipient == "" || recipientMsp == "" {
		return nil, fmt.Errorf("penerima disposisi (CN dan MSP) wajib diisi")
	}
	key, doc, who, err := loadWithIdentity(ctx, docID)
	if err != nil {
		return nil, err
	}
	if doc.Owner != who.ID {
		return deny(ctx, docID, who, "percobaan disposisi oleh non-pemilik")
	}
	if doc.Revoked {
		return deny(ctx, docID, who, "percobaan disposisi dokumen yang sudah dicabut")
	}
	q := QualifiedName(recipientMsp, recipient)
	added := false
	for i, r := range doc.Recipients {
		if doc.RecipientIDs[i] == q {
			return &ActionResult{Ok: true, Reason: "penerima sudah ada", Document: doc}, nil
		}
		if doc.RecipientIDs[i] == "" && r == recipient {
			doc.RecipientIDs[i] = q // entri lama: kunci ke MSP penerima
			added = true
			break
		}
	}
	if !added {
		doc.Recipients = append(doc.Recipients, recipient)
		doc.RecipientIDs = append(doc.RecipientIDs, q)
	}
	if doc.UpdatedAt, err = txTime(ctx); err != nil {
		return nil, err
	}
	if err := putDoc(ctx, key, doc); err != nil {
		return nil, err
	}
	if err := writeLog(ctx, docID, ActionDisposition, who, "kepada "+q+": "+catatan); err != nil {
		return nil, err
	}
	return &ActionResult{Ok: true, Reason: "disposisi tercatat", Document: doc}, nil
}

// RevokeDocument mencabut dokumen (mis. sudah tidak berlaku / bocor).
// Boleh dilakukan pemilik atau user ber-role admin.
func (c *SandiContract) RevokeDocument(ctx contractapi.TransactionContextInterface,
	docID, alasan string) (*ActionResult, error) {

	key, doc, who, err := loadWithIdentity(ctx, docID)
	if err != nil {
		return nil, err
	}
	if doc.Owner != who.ID && who.Role != "admin" {
		return deny(ctx, docID, who, "percobaan pencabutan oleh pihak tidak berwenang")
	}
	doc.Revoked = true
	if doc.UpdatedAt, err = txTime(ctx); err != nil {
		return nil, err
	}
	if err := putDoc(ctx, key, doc); err != nil {
		return nil, err
	}
	if err := writeLog(ctx, docID, ActionRevoke, who, alasan); err != nil {
		return nil, err
	}
	return &ActionResult{Ok: true, Reason: "dokumen dicabut", Document: doc}, nil
}

// ---------------------------------------------------------------------------
// Query (evaluate)
// ---------------------------------------------------------------------------

// GetDocument mengembalikan metadata dokumen jika clearance mencukupi.
func (c *SandiContract) GetDocument(ctx contractapi.TransactionContextInterface, docID string) (*Document, error) {
	_, doc, err := getDoc(ctx, docID)
	if err != nil {
		return nil, err
	}
	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if ok, reason := CanView(doc, who); !ok {
		return nil, fmt.Errorf("tidak berwenang: %s", reason)
	}
	return doc, nil
}

// ListDocuments mengembalikan dokumen yang boleh dilihat pemanggil (CanView):
// klasifikasi <= clearance, dan untuk SANGAT_RAHASIA hanya pemilik/penerima.
func (c *SandiContract) ListDocuments(ctx contractapi.TransactionContextInterface) ([]*Document, error) {
	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	it, err := ctx.GetStub().GetStateByPartialCompositeKey(docPrefix, []string{})
	if err != nil {
		return nil, err
	}
	defer it.Close()

	out := []*Document{}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var d Document
		if err := json.Unmarshal(kv.Value, &d); err != nil {
			return nil, err
		}
		normalize(&d)
		if ok, _ := CanView(&d, who); ok {
			out = append(out, &d)
		}
	}
	return out, nil
}

// ListDocumentsPage versi berpaginasi dari ListDocuments, supaya respons
// tidak membengkak seiring jumlah dokumen (batas pesan gRPC, memori peer).
func (c *SandiContract) ListDocumentsPage(ctx contractapi.TransactionContextInterface,
	pageSize int32, bookmark string) (*DocumentPage, error) {

	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	pageSize = clampPage(pageSize)
	it, meta, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(docPrefix, []string{}, pageSize, bookmark)
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := &DocumentPage{Documents: []*Document{}}
	for it.HasNext() {
		kv, err := it.Next()
		if err != nil {
			return nil, err
		}
		var d Document
		if err := json.Unmarshal(kv.Value, &d); err != nil {
			return nil, err
		}
		normalize(&d)
		if ok, _ := CanView(&d, who); ok {
			out.Documents = append(out.Documents, &d)
		}
	}
	out.Bookmark = nextBookmark(meta.GetFetchedRecordsCount(), pageSize, meta.GetBookmark())
	return out, nil
}

// GetAuditTrail mengembalikan seluruh log satu dokumen. Pemilik dan auditor saja.
func (c *SandiContract) GetAuditTrail(ctx contractapi.TransactionContextInterface, docID string) ([]*AuditLog, error) {
	_, doc, err := getDoc(ctx, docID)
	if err != nil {
		return nil, err
	}
	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if doc.Owner != who.ID && who.Role != "auditor" && who.Role != "admin" {
		return nil, fmt.Errorf("hanya pemilik, auditor, atau admin yang boleh melihat audit trail")
	}
	return queryLogs(ctx, []string{docID})
}

// GetAllAuditLogs untuk dashboard unit pengamanan (role auditor/admin).
func (c *SandiContract) GetAllAuditLogs(ctx contractapi.TransactionContextInterface) ([]*AuditLog, error) {
	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if who.Role != "auditor" && who.Role != "admin" {
		return nil, fmt.Errorf("hanya auditor atau admin")
	}
	return queryLogs(ctx, []string{})
}

// GetAllAuditLogsPage versi berpaginasi dari GetAllAuditLogs.
func (c *SandiContract) GetAllAuditLogsPage(ctx contractapi.TransactionContextInterface,
	pageSize int32, bookmark string) (*AuditPage, error) {

	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if who.Role != "auditor" && who.Role != "admin" {
		return nil, fmt.Errorf("hanya auditor atau admin")
	}
	pageSize = clampPage(pageSize)
	it, meta, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(logPrefix, []string{}, pageSize, bookmark)
	if err != nil {
		return nil, err
	}
	defer it.Close()
	logs, err := collectLogs(it)
	if err != nil {
		return nil, err
	}
	return &AuditPage{Logs: logs, Bookmark: nextBookmark(meta.GetFetchedRecordsCount(), pageSize, meta.GetBookmark())}, nil
}

// GetAccessGrant mengembalikan satu entri log (docId, txId). Dipakai KeyGuard
// untuk memastikan ada ACCESS_GRANTED yang sah di ledger sebelum melepas
// kunci dokumen. Hanya role keyguard, auditor, atau admin.
func (c *SandiContract) GetAccessGrant(ctx contractapi.TransactionContextInterface, docID, txID string) (*AuditLog, error) {
	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if who.Role != "keyguard" && who.Role != "auditor" && who.Role != "admin" {
		return nil, fmt.Errorf("hanya keyguard, auditor, atau admin")
	}
	key, err := ctx.GetStub().CreateCompositeKey(logPrefix, []string{docID, txID})
	if err != nil {
		return nil, err
	}
	b, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, fmt.Errorf("entri akses %s untuk dokumen %s tidak ditemukan", txID, docID)
	}
	var l AuditLog
	if err := json.Unmarshal(b, &l); err != nil {
		return nil, err
	}
	return &l, nil
}

// GetDocumentHistory mengembalikan riwayat perubahan state dokumen langsung
// dari history DB Fabric (bukti tambahan bahwa ledger tidak dimanipulasi).
func (c *SandiContract) GetDocumentHistory(ctx contractapi.TransactionContextInterface, docID string) ([]map[string]interface{}, error) {
	key, doc, err := getDoc(ctx, docID)
	if err != nil {
		return nil, err
	}
	who, err := identify(ctx)
	if err != nil {
		return nil, err
	}
	if doc.Owner != who.ID && who.Role != "auditor" && who.Role != "admin" {
		return nil, fmt.Errorf("tidak berwenang")
	}
	it, err := ctx.GetStub().GetHistoryForKey(key)
	if err != nil {
		return nil, err
	}
	defer it.Close()
	out := []map[string]interface{}{}
	for it.HasNext() {
		m, err := it.Next()
		if err != nil {
			return nil, err
		}
		var d Document
		_ = json.Unmarshal(m.Value, &d)
		out = append(out, map[string]interface{}{
			"txId":      m.TxId,
			"timestamp": m.Timestamp.AsTime().UTC().Format(time.RFC3339),
			"version":   d.Version,
			"hash":      d.Hash,
			"revoked":   d.Revoked,
		})
	}
	return out, nil
}
