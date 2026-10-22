# Webhook signatures and endpoint activation

This is the V1 signing and ownership-verification contract. Endpoint activation
and verification requests are implemented. The delivery worker does not send
accepted events yet.

## Activate a destination

All management requests require `Authorization: Bearer <project-api-key>`.

1. Create an endpoint using `POST /v1/endpoints` with `url` and `event_types`.
   It starts disabled and unverified, with `has_signing_secret: false`.
2. Send `POST /v1/endpoints/{endpoint_id}/signing-secret` with an empty body.
   The `200` response contains `endpoint_id`, `signing_secret`, `updated_at`,
   and `previous_secret_expires_at`. Store the returned secret at the receiver.
   This is its only disclosure; list/update/verification responses never contain it.
3. Implement signature checking and the verification response described below.
4. Send `POST /v1/endpoints/{endpoint_id}/verify` with an empty body. Cascadehook
   sends a signed challenge to the endpoint's configured URL. A valid proof
   produces `200` with the endpoint object and its new `verified_at` timestamp.
5. Send `PATCH /v1/endpoints/{endpoint_id}` with `{"enabled":true}` to opt in
   to event fan-out. Verification itself does not enable delivery.

The secret action also rotates an existing credential. The secret has the form
`whsec_` followed by standard, padded Base64 of 32 random bytes. Remove the
prefix and Base64-decode the remainder to obtain the HMAC key. Do not use the
token's text or its prefix as the key.

## Verify an incoming signature

Requests have `Content-Type: application/json` and three signature headers:

| Header | Value |
| --- | --- |
| `Webhook-Id` | UUIDv7 identifying this delivery or verification request |
| `Webhook-Timestamp` | Decimal Unix timestamp in seconds |
| `Webhook-Signature` | One or more space-separated `v1,<signature>` entries |

The signed message is this exact byte concatenation:

```text
UTF8(Webhook-Id) || "." || UTF8(Webhook-Timestamp) || "." || raw_request_body
```

Each signature is standard, padded Base64 of
`HMAC-SHA256(decoded_signing_key, signed_message)`.

At the receiver:

1. Require exactly one value for each signature header. Check that the ID is a
   UUID and the timestamp is a decimal Unix timestamp.
2. Reject timestamps more than five minutes in the past or future. Keep the
   receiver clock synchronized.
3. Compute the HMAC over the original body bytes before parsing JSON. Do not
   normalize whitespace, object-key order, Unicode, or numeric representations.
4. Split `Webhook-Signature` on spaces, select supported `v1,` entries, decode
   them, and compare MAC bytes with a constant-time comparison. Accept if at
   least one matches a credential currently accepted by the receiver.
5. Reject failures before executing business logic. Deduplicate ordinary
   deliveries using `Webhook-Id`; retries will keep the same delivery ID while
   generating a fresh timestamp and signature.

The maximum accepted event body is 256 KiB. The complete published envelope is
the body that the future worker will deliver.

## Answer an ownership challenge

The challenge is sent as a signed `POST` to the configured HTTPS URL:

```json
{
  "type": "endpoint.verification",
  "data": {
    "endpoint_id": "<endpoint UUID>",
    "challenge": "<random Base64url token without padding>"
  }
}
```

Validate the incoming signature and timestamp first. Then use the **current**
signing key to calculate:

```text
proof_message = UTF8("cascadehook.verify.v1.") || UTF8(Webhook-Id) || "." || UTF8(data.challenge)
proof = Base64(HMAC-SHA256(decoded_current_signing_key, proof_message))
```

Return HTTP `200` with a JSON object containing only this field:

```json
{"proof":"<standard padded Base64 HMAC>"}
```

Echoing the request or its random token is insufficient. The proof demonstrates
that the receiver knows the credential configured through the management API.
Challenge tokens and proofs are never returned through that API or written to
operational logs. No database transaction stays open during the HTTPS request.

The response must fit within 4 KiB. Redirects, non-2xx statuses, unreadable or
oversized responses, and incorrect proofs fail verification. Verification shares
the management API's ten-second request deadline. Another attempt is allowed
after a 30-second endpoint cooldown; earlier requests return `429` with
`Retry-After: 30`.

Changing the URL, rotating a secret, or starting a newer verification attempt
invalidates an outstanding challenge through a database version check. URL
changes also clear `verified_at` and disable the endpoint. Deletion causes
confirmation to return `404`.

## Rotate a signing secret

Calling the secret action again generates a new current credential and returns
it once. The previous credential is retained for five minutes; its database
deadline is returned as `previous_secret_expires_at`. During that window,
outgoing signature headers contain a signature from each key. Configure the
new key promptly, then stop accepting the old key at its expiry.

Verification proofs must always use the current key, including during rotation.
Another rotation during the overlap returns `409` with code
`signing_secret_rotation_in_progress`, preventing a chain of prematurely
discarded keys. Rotation preserves existing ownership verification and enabled
state because the destination URL has not changed. A newly provisioned endpoint
still needs verification and an explicit enable request.

There is no secret-retrieval API. If the secret response is lost after commit,
use the rotation action again once any active overlap has ended.

## API errors

Errors use `application/problem+json` with a machine-readable `code`.

| Status | Code | Meaning |
| --- | --- | --- |
| `404` | `endpoint_not_found` | Missing, deleted, or another project's endpoint |
| `409` | `signing_secret_required` | Provision a credential before verification |
| `409` | `endpoint_not_verified` | Complete ownership verification before enabling |
| `409` | `signing_secret_rotation_in_progress` | Wait for the current overlap to end |
| `409` | `endpoint_verification_changed` | Configuration changed or a newer challenge started |
| `422` | `unsafe_endpoint_destination` | URL or resolved addresses violate the outbound policy |
| `422` | `invalid_verification_proof` | Receiver did not return the expected HMAC proof |
| `429` | `endpoint_verification_rate_limited` | Endpoint challenge cooldown is active |
| `502` | `endpoint_verification_failed` | HTTPS request or response failed verification |

## Operator configuration and outbound policy

The API requires `SIGNING_ENCRYPTION_KEY`, standard Base64 of 32 random bytes,
in addition to the existing database configuration. For example, generate it
with `openssl rand -base64 32` and store the result as a Railway secret variable.
Migration and seed commands do not require this key. Retain and back it up:
changing it without re-encrypting existing data makes stored credentials
undecryptable. Online encryption-key rotation is separate future work.

Credentials use AES-256-GCM with random nonces and authenticated project/endpoint
IDs. Database values contain a format-version byte, nonce, ciphertext, and tag;
plaintext secrets do not enter the store. No response body is persisted by the
transport or the verification flow.

Outbound requests require HTTPS with normal hostname/certificate validation
and TLS 1.2 or later. Environment proxies, automatic decompression, redirects,
and cookie storage are disabled. Every new connection resolves the destination,
rejects the whole answer set if any address is forbidden, and dials a validated
literal IP. HTTP Host and TLS SNI retain the configured hostname. A socket hook
checks the actual dial address again, preventing a second DNS lookup from
changing the destination between validation and connection.

The policy rejects private, loopback, link-local, unspecified, multicast,
shared/CGNAT, documentation, reserved, IPv4-mapped IPv6, standard NAT64, Teredo, and 6to4
destinations. IPv6 is limited to `2000::/3` with special-purpose ranges excluded;
special-purpose protocol ranges are conservatively blocked even when individual
addresses have globally reachable exceptions. Azure's platform virtual IP is
also blocked. The reviewed references are the
[IANA IPv4 registry](https://www.iana.org/assignments/iana-ipv4-special-registry),
[IANA IPv6 registry](https://www.iana.org/assignments/iana-ipv6-special-registry),
and [Azure platform-IP documentation](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16).

The client permits at most 32 concurrent calls and four connections per host.
Its total deadline is 30 seconds, including capacity waiting and body reading;
DNS/TCP connection attempts share five seconds. TLS handshake, response-header,
and response-body bounds also apply. At most 32 KiB of response headers and
4 KiB of response body are captured. Captured bytes remain sensitive and must
be redacted before any future attempt-history retention. Queue retries must
consider a received HTTP status even if reading its body later fails.

Network behavior, IP rejection, proof verification, rotation, and concurrency
races still require manual verification on Railway after migrations are applied.
Global/project abuse controls and network egress policy remain separate work.
