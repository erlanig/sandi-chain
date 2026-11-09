package contract

import "testing"

func TestCanAccess(t *testing.T) {
	base := func(k string) *Document {
		return &Document{Owner: "owner-id", Klasifikasi: k, Recipients: []string{"kapten.andi"}}
	}
	cases := []struct {
		name      string
		doc       *Document
		uid, cn   string
		clearance string
		want      bool
	}{
		{"pemilik selalu boleh", base("SANGAT_RAHASIA"), "owner-id", "x", "BIASA", true},
		{"clearance kurang", base("RAHASIA"), "u", "u", "TERBATAS", false},
		{"clearance pas", base("RAHASIA"), "u", "u", "RAHASIA", true},
		{"clearance lebih", base("TERBATAS"), "u", "u", "SANGAT_RAHASIA", true},
		{"SR tanpa disposisi", base("SANGAT_RAHASIA"), "u", "letda.budi", "SANGAT_RAHASIA", false},
		{"SR dengan disposisi", base("SANGAT_RAHASIA"), "u", "kapten.andi", "SANGAT_RAHASIA", true},
		{"SR disposisi tapi clearance kurang", base("SANGAT_RAHASIA"), "u", "kapten.andi", "RAHASIA", false},
	}
	for _, c := range cases {
		got, reason := CanAccess(c.doc, c.uid, c.cn, c.clearance)
		if got != c.want {
			t.Errorf("%s: got %v (%s), want %v", c.name, got, reason, c.want)
		}
	}

	revoked := base("BIASA")
	revoked.Revoked = true
	if ok, _ := CanAccess(revoked, "owner-id", "", "SANGAT_RAHASIA"); ok {
		t.Error("dokumen dicabut harus ditolak, termasuk untuk pemilik")
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
