package contract

import "testing"

func person(id, msp, cn, clearance, role string) *Identity {
	return &Identity{ID: id, MSP: msp, Name: cn, Clearance: clearance, Role: role}
}

func doc(k string) *Document {
	return &Document{
		Owner:        "owner-id",
		Klasifikasi:  k,
		Recipients:   []string{"kapten.andi"},
		RecipientIDs: []string{"Org2MSP/kapten.andi"},
	}
}

func TestCanAccess(t *testing.T) {
	cases := []struct {
		name string
		doc  *Document
		who  *Identity
		want bool
	}{
		{"pemilik selalu boleh", doc("SANGAT_RAHASIA"), person("owner-id", "Org1MSP", "x", "BIASA", "user"), true},
		{"clearance kurang", doc("RAHASIA"), person("u", "Org1MSP", "u", "TERBATAS", "user"), false},
		{"clearance pas", doc("RAHASIA"), person("u", "Org1MSP", "u", "RAHASIA", "user"), true},
		{"clearance lebih", doc("TERBATAS"), person("u", "Org1MSP", "u", "SANGAT_RAHASIA", "user"), true},
		{"SR tanpa disposisi", doc("SANGAT_RAHASIA"), person("u", "Org1MSP", "letda.budi", "SANGAT_RAHASIA", "user"), false},
		{"SR dengan disposisi", doc("SANGAT_RAHASIA"), person("u", "Org2MSP", "kapten.andi", "SANGAT_RAHASIA", "user"), true},
		{"SR disposisi tapi clearance kurang", doc("SANGAT_RAHASIA"), person("u", "Org2MSP", "kapten.andi", "RAHASIA", "user"), false},
		{"SR: CN sama dari org lain ditolak", doc("SANGAT_RAHASIA"), person("u", "Org1MSP", "kapten.andi", "SANGAT_RAHASIA", "user"), false},
		{"auditor tidak otomatis boleh membuka isi", doc("RAHASIA"), person("a", "Org1MSP", "auditor.pam", "TERBATAS", "auditor"), false},
	}
	for _, c := range cases {
		got, reason := CanAccess(c.doc, c.who)
		if got != c.want {
			t.Errorf("%s: got %v (%s), want %v", c.name, got, reason, c.want)
		}
	}

	revoked := doc("BIASA")
	revoked.Revoked = true
	if ok, _ := CanAccess(revoked, person("owner-id", "Org1MSP", "", "SANGAT_RAHASIA", "user")); ok {
		t.Error("dokumen dicabut harus ditolak, termasuk untuk pemilik")
	}
}

func TestCanAccessLegacyRecipient(t *testing.T) {
	// Dokumen lama: Recipients berisi CN tanpa RecipientIDs.
	d := &Document{Owner: "o", Klasifikasi: "SANGAT_RAHASIA", Recipients: []string{"kapten.andi"}}
	normalize(d)
	if ok, _ := CanAccess(d, person("u", "Org2MSP", "kapten.andi", "SANGAT_RAHASIA", "user")); !ok {
		t.Error("entri disposisi lama (CN saja) harus tetap berlaku")
	}
}

func TestCanView(t *testing.T) {
	sr := doc("SANGAT_RAHASIA")
	if ok, _ := CanView(sr, person("u", "Org1MSP", "letda.x", "SANGAT_RAHASIA", "user")); ok {
		t.Error("metadata SR tidak boleh terlihat oleh non-penerima walau clearance cukup")
	}
	if ok, _ := CanView(sr, person("a", "Org1MSP", "auditor.pam", "RAHASIA", "auditor")); !ok {
		t.Error("auditor boleh melihat metadata semua dokumen")
	}
	if ok, _ := CanView(doc("RAHASIA"), person("u", "Org2MSP", "serka.budi", "TERBATAS", "user")); ok {
		t.Error("clearance kurang tidak boleh melihat metadata")
	}
	revoked := doc("RAHASIA")
	revoked.Revoked = true
	if ok, _ := CanView(revoked, person("owner-id", "Org1MSP", "x", "RAHASIA", "user")); !ok {
		t.Error("metadata dokumen dicabut tetap terlihat oleh pemilik")
	}
}

func TestMatchVersion(t *testing.T) {
	d := &Document{Hash: "c", Version: 3, History: []string{"a", "b"}}
	if r := MatchVersion(d, "c"); !r.Authentic || r.MatchedVersion != 3 {
		t.Errorf("versi terbaru: %+v", r)
	}
	if r := MatchVersion(d, "a"); !r.Authentic || r.MatchedVersion != 1 {
		t.Errorf("versi lama: %+v", r)
	}
	if r := MatchVersion(d, "z"); r.Authentic {
		t.Errorf("hash asing harus TIDAK COCOK: %+v", r)
	}
}
