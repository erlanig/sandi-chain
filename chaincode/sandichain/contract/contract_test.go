package contract

import (
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
	"github.com/hyperledger/fabric-protos-go-apiv2/ledger/queryresult"
	"github.com/hyperledger/fabric-protos-go-apiv2/peer"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// ---------------------------------------------------------------------------
// Ledger tiruan di memori. Interface di-embed: method yang tidak dipakai
// chaincode akan panic kalau terpanggil, sehingga test ketahuan kalau kontrak
// mulai memakai API baru.
// ---------------------------------------------------------------------------

type ledger struct {
	state  map[string][]byte
	events []string // nama event per transaksi, urut
	txSeq  int
}

type fakeStub struct {
	shim.ChaincodeStubInterface
	l    *ledger
	txID string
}

func (s *fakeStub) GetTxID() string { return s.txID }
func (s *fakeStub) GetTxTimestamp() (*timestamppb.Timestamp, error) {
	return timestamppb.New(time.Date(2026, 11, 10, 8, 0, s.l.txSeq, 0, time.UTC)), nil
}
func (s *fakeStub) GetState(k string) ([]byte, error) { return s.l.state[k], nil }
func (s *fakeStub) PutState(k string, v []byte) error { s.l.state[k] = v; return nil }
func (s *fakeStub) SetEvent(name string, _ []byte) error {
	s.l.events = append(s.l.events, name)
	return nil
}
func (s *fakeStub) CreateCompositeKey(t string, attrs []string) (string, error) {
	k := "\x00" + t + "\x00"
	for _, a := range attrs {
		k += a + "\x00"
	}
	return k, nil
}

func (s *fakeStub) keysWithPrefix(t string, attrs []string) []string {
	prefix, _ := s.CreateCompositeKey(t, attrs)
	keys := []string{}
	for k := range s.l.state {
		if strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	return keys
}

func (s *fakeStub) GetStateByPartialCompositeKey(t string, attrs []string) (shim.StateQueryIteratorInterface, error) {
	return s.iter(s.keysWithPrefix(t, attrs)), nil
}

func (s *fakeStub) GetStateByPartialCompositeKeyWithPagination(t string, attrs []string, size int32, bookmark string) (
	shim.StateQueryIteratorInterface, *peer.QueryResponseMetadata, error) {
	keys := s.keysWithPrefix(t, attrs)
	start := 0
	if bookmark != "" {
		start = sort.SearchStrings(keys, bookmark)
	}
	end := min(start+int(size), len(keys))
	page := keys[start:end]
	next := ""
	if end < len(keys) {
		next = keys[end]
	}
	return s.iter(page), &peer.QueryResponseMetadata{FetchedRecordsCount: int32(len(page)), Bookmark: next}, nil
}

func (s *fakeStub) iter(keys []string) *fakeIter {
	it := &fakeIter{}
	for _, k := range keys {
		it.kvs = append(it.kvs, &queryresult.KV{Key: k, Value: s.l.state[k]})
	}
	return it
}

type fakeIter struct{ kvs []*queryresult.KV }

func (i *fakeIter) HasNext() bool { return len(i.kvs) > 0 }
func (i *fakeIter) Close() error  { return nil }
func (i *fakeIter) Next() (*queryresult.KV, error) {
	kv := i.kvs[0]
	i.kvs = i.kvs[1:]
	return kv, nil
}

type fakeIdentity struct {
	cid.ClientIdentity
	msp, cn string
	attrs   map[string]string
}

func (f *fakeIdentity) GetID() (string, error) {
	return fmt.Sprintf("x509::CN=%s::%s", f.cn, f.msp), nil
}
func (f *fakeIdentity) GetMSPID() (string, error) { return f.msp, nil }
func (f *fakeIdentity) GetX509Certificate() (*x509.Certificate, error) {
	return &x509.Certificate{Subject: pkix.Name{CommonName: f.cn}}, nil
}
func (f *fakeIdentity) GetAttributeValue(k string) (string, bool, error) {
	v, ok := f.attrs[k]
	return v, ok, nil
}

type actor struct{ msp, cn, clearance, role string }

var (
	danyon    = actor{"Org1MSP", "letkol.arya", "SANGAT_RAHASIA", "user"}
	kasiIntel = actor{"Org1MSP", "mayor.dewi", "RAHASIA", "user"}
	pasiOps   = actor{"Org2MSP", "kapten.andi", "SANGAT_RAHASIA", "user"}
	kembaran  = actor{"Org1MSP", "kapten.andi", "SANGAT_RAHASIA", "user"} // CN sama, org lain
	stafTU    = actor{"Org2MSP", "serka.budi", "TERBATAS", "user"}
	auditor   = actor{"Org1MSP", "auditor.pam", "RAHASIA", "auditor"}
)

// as membuat konteks transaksi baru (txID baru) untuk aktor tertentu.
func (l *ledger) as(a actor) contractapi.TransactionContextInterface {
	l.txSeq++
	ctx := &contractapi.TransactionContext{}
	ctx.SetStub(&fakeStub{l: l, txID: fmt.Sprintf("tx%03d", l.txSeq)})
	ctx.SetClientIdentity(&fakeIdentity{msp: a.msp, cn: a.cn,
		attrs: map[string]string{"clearance": a.clearance, "role": a.role, "jabatan": "-"}})
	return ctx
}

func (l *ledger) logs(t *testing.T) []*AuditLog {
	t.Helper()
	logs, err := queryLogs(l.as(auditor), []string{})
	if err != nil {
		t.Fatal(err)
	}
	return logs
}

func (l *ledger) lastLog(t *testing.T) *AuditLog {
	t.Helper()
	var last *AuditLog
	for _, x := range l.logs(t) {
		if last == nil || x.TxID > last.TxID {
			last = x
		}
	}
	return last
}

func (l *ledger) lastEvent() string {
	if len(l.events) == 0 {
		return ""
	}
	return l.events[len(l.events)-1]
}

func newLedger() *ledger { return &ledger{state: map[string][]byte{}} }

const h1 = "1111111111111111111111111111111111111111111111111111111111111111"
const h2 = "2222222222222222222222222222222222222222222222222222222222222222"

func mustRegister(t *testing.T, l *ledger, a actor, id, klas string) {
	t.Helper()
	r, err := (&SandiContract{}).RegisterDocument(l.as(a), id, "NO/"+id, h1, klas)
	if err != nil || !r.Ok {
		t.Fatalf("register %s: %v %+v", id, err, r)
	}
}

// ---------------------------------------------------------------------------

func TestRegisterDeniedIsLogged(t *testing.T) {
	l := newLedger()
	r, err := (&SandiContract{}).RegisterDocument(l.as(stafTU), "D1", "NO/1", h1, "RAHASIA")
	if err != nil {
		t.Fatalf("penolakan tidak boleh berupa error (log akan hilang): %v", err)
	}
	if r.Ok {
		t.Fatal("staf TU tidak boleh mendaftarkan dokumen RAHASIA")
	}
	if log := l.lastLog(t); log == nil || log.Action != ActionAccessDenied || log.Actor != "serka.budi" {
		t.Fatalf("penolakan harus tercatat ACCESS_DENIED: %+v", log)
	}
	if l.lastEvent() != EventUnauthorized {
		t.Fatalf("harus ada event %s, dapat %q", EventUnauthorized, l.lastEvent())
	}
	if _, _, err := getDoc(l.as(auditor), "D1"); err == nil {
		t.Fatal("dokumen yang ditolak tidak boleh tersimpan")
	}
}

func TestNeedToKnowFlow(t *testing.T) {
	l := newLedger()
	c := &SandiContract{}
	mustRegister(t, l, danyon, "SR1", "SANGAT_RAHASIA")

	// Sebelum disposisi: ditolak dan tercatat.
	a, err := c.RequestAccess(l.as(pasiOps), "SR1")
	if err != nil || a.Granted || a.Hash != "" {
		t.Fatalf("pasi ops belum didisposisi harus ditolak tanpa hash: %v %+v", err, a)
	}
	if l.lastLog(t).Action != ActionAccessDenied {
		t.Fatal("penolakan akses harus tercatat")
	}
	if _, err := c.GetDocument(l.as(pasiOps), "SR1"); err == nil {
		t.Fatal("metadata SR tidak boleh terlihat sebelum disposisi")
	}

	// Disposisi oleh non-pemilik ditolak.
	if r, err := c.AddDisposition(l.as(pasiOps), "SR1", "kapten.andi", "Org2MSP", ""); err != nil || r.Ok {
		t.Fatalf("disposisi oleh non-pemilik harus ditolak: %v %+v", err, r)
	}

	if r, err := c.AddDisposition(l.as(danyon), "SR1", "kapten.andi", "Org2MSP", "pelajari"); err != nil || !r.Ok {
		t.Fatalf("disposisi pemilik: %v %+v", err, r)
	}
	if a, _ := c.RequestAccess(l.as(pasiOps), "SR1"); !a.Granted || a.Hash != h1 {
		t.Fatalf("penerima disposisi harus bisa membuka: %+v", a)
	}
	if a, _ := c.RequestAccess(l.as(kembaran), "SR1"); a.Granted {
		t.Fatal("CN sama dari org lain tidak boleh ikut mendapat akses")
	}
	if a, _ := c.RequestAccess(l.as(kasiIntel), "SR1"); a.Granted {
		t.Fatal("clearance RAHASIA tidak boleh membuka SR")
	}

	// Disposisi ganda tidak menambah entri.
	r, _ := c.AddDisposition(l.as(danyon), "SR1", "kapten.andi", "Org2MSP", "")
	if len(r.Document.Recipients) != 1 {
		t.Fatalf("disposisi ganda: %+v", r.Document.Recipients)
	}
}

func TestAddVersionOwnerOnly(t *testing.T) {
	l := newLedger()
	c := &SandiContract{}
	mustRegister(t, l, kasiIntel, "R1", "RAHASIA")

	for _, who := range []actor{stafTU, auditor} {
		r, err := c.AddVersion(l.as(who), "R1", h2)
		if err != nil || r.Ok {
			t.Fatalf("%s merevisi harus ditolak tanpa error: %v %+v", who.cn, err, r)
		}
		if log := l.lastLog(t); log.Action != ActionAccessDenied || log.Actor != who.cn {
			t.Fatalf("percobaan revisi %s harus tercatat: %+v", who.cn, log)
		}
	}
	r, err := c.AddVersion(l.as(kasiIntel), "R1", h2)
	if err != nil || !r.Ok || r.Document.Version != 2 || r.Document.History[0] != h1 {
		t.Fatalf("revisi pemilik: %v %+v", err, r)
	}
	v, _ := c.VerifyDocument(l.as(kasiIntel), "R1", h1)
	if !v.Authentic || v.MatchedVersion != 1 {
		t.Fatalf("versi lama tetap terverifikasi: %+v", v)
	}
}

func TestVerifyRequiresView(t *testing.T) {
	l := newLedger()
	c := &SandiContract{}
	mustRegister(t, l, kasiIntel, "R1", "RAHASIA")

	v, err := c.VerifyDocument(l.as(stafTU), "R1", h1)
	if err != nil || !v.Denied || v.Authentic {
		t.Fatalf("verifikasi tanpa wewenang harus ditolak tanpa membocorkan hasil: %v %+v", err, v)
	}
	if l.lastLog(t).Action != ActionAccessDenied || l.lastEvent() != EventUnauthorized {
		t.Fatal("verifikasi tanpa wewenang harus tercatat + alert")
	}

	v, _ = c.VerifyDocument(l.as(auditor), "R1", h2)
	if v.Denied || v.Authentic || l.lastEvent() != EventTampered {
		t.Fatalf("auditor boleh verifikasi; file asing => DocumentTampered: %+v", v)
	}
}

func TestRevoke(t *testing.T) {
	l := newLedger()
	c := &SandiContract{}
	mustRegister(t, l, kasiIntel, "R1", "RAHASIA")

	if r, _ := c.RevokeDocument(l.as(stafTU), "R1", "iseng"); r.Ok {
		t.Fatal("non-pemilik tidak boleh mencabut")
	}
	if r, _ := c.RevokeDocument(l.as(kasiIntel), "R1", "bocor"); !r.Ok {
		t.Fatal("pemilik boleh mencabut")
	}
	if a, _ := c.RequestAccess(l.as(kasiIntel), "R1"); a.Granted {
		t.Fatal("dokumen dicabut tidak boleh dibuka")
	}
	if r, _ := c.AddDisposition(l.as(kasiIntel), "R1", "kapten.andi", "Org2MSP", ""); r.Ok {
		t.Fatal("disposisi dokumen dicabut harus ditolak")
	}
	if r, _ := c.AddVersion(l.as(kasiIntel), "R1", h2); r.Ok {
		t.Fatal("revisi dokumen dicabut harus ditolak")
	}
}

func TestPagination(t *testing.T) {
	l := newLedger()
	c := &SandiContract{}
	for i := 0; i < 5; i++ {
		mustRegister(t, l, kasiIntel, fmt.Sprintf("R%d", i), "RAHASIA")
	}
	mustRegister(t, l, danyon, "SR", "SANGAT_RAHASIA")

	collect := func(a actor) []string {
		ids, bm, pages := []string{}, "", 0
		for {
			p, err := c.ListDocumentsPage(l.as(a), 2, bm)
			if err != nil {
				t.Fatal(err)
			}
			for _, d := range p.Documents {
				ids = append(ids, d.DocID)
			}
			pages++
			if bm = p.Bookmark; bm == "" || pages > 10 {
				break
			}
		}
		return ids
	}
	if got := collect(kasiIntel); len(got) != 5 {
		t.Fatalf("kasi intel melihat 5 dokumen RAHASIA, bukan SR: %v", got)
	}
	if got := collect(pasiOps); len(got) != 5 {
		t.Fatalf("pasi ops (SR, belum disposisi) tidak melihat dokumen SR: %v", got)
	}
	if got := collect(auditor); len(got) != 6 {
		t.Fatalf("auditor melihat semua: %v", got)
	}
	if got := collect(stafTU); len(got) != 0 {
		t.Fatalf("staf TU tidak melihat apa pun: %v", got)
	}

	total, bm := 0, ""
	for {
		p, err := c.GetAllAuditLogsPage(l.as(auditor), 4, bm)
		if err != nil {
			t.Fatal(err)
		}
		total += len(p.Logs)
		if bm = p.Bookmark; bm == "" {
			break
		}
	}
	if total != 6 {
		t.Fatalf("audit berpaginasi harus mengembalikan 6 log REGISTER, dapat %d", total)
	}
	if _, err := c.GetAllAuditLogsPage(l.as(kasiIntel), 4, ""); err == nil {
		t.Fatal("non-auditor tidak boleh membaca seluruh audit")
	}
}

func TestGetAccessGrant(t *testing.T) {
	l := newLedger()
	c := &SandiContract{}
	keyguard := actor{"Org1MSP", "keyguard", "BIASA", "keyguard"}
	mustRegister(t, l, kasiIntel, "R1", "RAHASIA")

	ctx := l.as(kasiIntel)
	if a, _ := c.RequestAccess(ctx, "R1"); !a.Granted {
		t.Fatal("pemilik harus bisa membuka")
	}
	txID := ctx.GetStub().GetTxID()

	g, err := c.GetAccessGrant(l.as(keyguard), "R1", txID)
	if err != nil || g.Action != ActionAccessGrant || g.Actor != "mayor.dewi" {
		t.Fatalf("keyguard harus menemukan ACCESS_GRANTED: %v %+v", err, g)
	}
	if _, err := c.GetAccessGrant(l.as(kasiIntel), "R1", txID); err == nil {
		t.Fatal("user biasa tidak boleh memanggil GetAccessGrant")
	}
	if _, err := c.GetAccessGrant(l.as(keyguard), "R1", "tx-palsu"); err == nil {
		t.Fatal("txId yang tidak ada harus error")
	}
}
