package auth

import (
	"crypto/sha256"
	"encoding/binary"
)

func IdentityDigest(identity SessionIdentity) [sha256.Size]byte {
	// Length-prefix the issuer so two identity pairs cannot share an encoding.
	encoded := make([]byte, 8, 8+len(identity.Issuer)+len(identity.Subject))
	binary.BigEndian.PutUint64(encoded, uint64(len(identity.Issuer)))
	encoded = append(encoded, identity.Issuer...)
	encoded = append(encoded, identity.Subject...)
	return sha256.Sum256(encoded)
}
