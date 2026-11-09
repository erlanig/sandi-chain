package contract

// Tingkat klasifikasi dokumen. Angka lebih besar = lebih rahasia.
var levels = map[string]int{
	"BIASA":          1,
	"TERBATAS":       2,
	"RAHASIA":        3,
	"SANGAT_RAHASIA": 4,
}

const (
	ActionRegister     = "REGISTER"
	ActionNewVersion   = "NEW_VERSION"
	ActionAccessGrant  = "ACCESS_GRANTED"
	ActionAccessDenied = "ACCESS_DENIED"
	ActionVerifyOK     = "VERIFY_OK"
	ActionVerifyFail   = "VERIFY_TAMPERED"
	ActionDisposition  = "DISPOSITION"
	ActionRevoke       = "REVOKE"

	EventUnauthorized = "UnauthorizedAccess"
	EventTampered     = "DocumentTampered"
	EventRegistered   = "DocumentRegistered"

	docPrefix = "DOC"
	logPrefix = "LOG"
)

// Document disimpan di world state. File-nya sendiri TIDAK disimpan di chain.
type Document struct {
	DocType     string   `json:"docType"`
	DocID       string   `json:"docId"`
	Nomor       string   `json:"nomor"`
	Hash        string   `json:"hash"` // SHA-256 hex dari file plaintext
	Klasifikasi string   `json:"klasifikasi"`
	Owner       string   `json:"owner"`     // ID sertifikat pembuat
	OwnerName   string   `json:"ownerName"` // CN sertifikat
	OwnerOrg    string   `json:"ownerOrg"`  // MSP ID
	Version     int      `json:"version"`
	History     []string `json:"history"`    // hash versi-versi sebelumnya
	Recipients  []string `json:"recipients"` // CN penerima disposisi (akses tambahan "need to know")
	Revoked     bool     `json:"revoked"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

// AuditLog adalah jejak aksi yang immutable. Satu entri per transaksi.
type AuditLog struct {
	DocType   string `json:"docType"`
	TxID      string `json:"txId"`
	DocID     string `json:"docId"`
	Action    string `json:"action"`
	Actor     string `json:"actor"`
	ActorOrg  string `json:"actorOrg"`
	Clearance string `json:"clearance"`
	Jabatan   string `json:"jabatan"`
	Detail    string `json:"detail"`
	Timestamp string `json:"timestamp"`
}

// AccessResult dikembalikan ke backend saat RequestAccess.
type AccessResult struct {
	Granted bool   `json:"granted"`
	Reason  string `json:"reason"`
	Hash    string `json:"hash"`
	Version int    `json:"version"`
}

// ActionResult untuk aksi tulis yang bisa ditolak (revisi, disposisi, cabut).
// Penolakan dikembalikan sebagai Ok=false (bukan error) agar log-nya ter-commit.
type ActionResult struct {
	Ok       bool      `json:"ok"`
	Reason   string    `json:"reason"`
	Document *Document `json:"document,omitempty" metadata:",optional"` // kosong saat ditolak
}

// VerifyResult dikembalikan saat verifikasi keaslian.
type VerifyResult struct {
	Authentic      bool   `json:"authentic"`
	MatchedVersion int    `json:"matchedVersion"` // 0 kalau tidak cocok sama sekali
	LatestVersion  int    `json:"latestVersion"`
	Message        string `json:"message"`
}
