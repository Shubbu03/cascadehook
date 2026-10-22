package delivery

import (
	"context"
	"errors"
	"net"
	"net/netip"
	"strings"
	"syscall"
	"time"
)

var ErrUnsafeDestination = errors.New("destination is not a permitted public HTTPS address")

// Fail closed for special-purpose networks, including transition mechanisms
// that could embed a private IPv4 destination. The IPv6 policy admits only the
// current global-unicast allocation, with special-purpose exceptions removed.
// Review against the IANA registries when changing this policy.
var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("168.63.129.16/32"), // Azure platform virtual IP.
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"),
	netip.MustParsePrefix("3ffe::/16"),
	netip.MustParsePrefix("3fff::/20"),
}

var globalIPv6 = netip.MustParsePrefix("2000::/3")

func publicAddress(address netip.Addr) bool {
	if !address.IsValid() || address.Zone() != "" || address.Is4In6() ||
		!address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	if address.Is6() && !globalIPv6.Contains(address) {
		return false
	}
	for _, prefix := range blockedNetworks {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

// The Go resolver preserves native A and AAAA address representations, allowing
// mapped AAAA answers to be rejected rather than silently unmapping them.
var resolver = &net.Resolver{PreferGo: true, StrictErrors: true}

func dialPublic(ctx context.Context, network, address string) (net.Conn, error) {
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return nil, ErrUnsafeDestination
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, ErrUnsafeDestination
	}
	ctx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	var addresses []netip.Addr
	if ip, err := netip.ParseAddr(host); err == nil {
		addresses = []netip.Addr{ip}
	} else {
		host = strings.TrimSuffix(strings.ToLower(host), ".")
		if !strings.Contains(host, ".") || strings.HasSuffix(host, ".localhost") ||
			strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".home.arpa") {
			return nil, ErrUnsafeDestination
		}
		addresses, err = resolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
	}
	if len(addresses) == 0 {
		return nil, ErrUnsafeDestination
	}
	// Reject the whole answer set before opening any connection. A public A
	// record must not make a destination with a private AAAA record acceptable.
	for _, ip := range addresses {
		if !publicAddress(ip) {
			return nil, ErrUnsafeDestination
		}
	}
	dialer := net.Dialer{
		KeepAlive: 30 * time.Second,
		ControlContext: func(_ context.Context, _ string, actual string, _ syscall.RawConn) error {
			ip, err := netip.ParseAddrPort(actual)
			if err != nil || !publicAddress(ip.Addr()) {
				return ErrUnsafeDestination
			}
			return nil
		},
	}
	var lastErr error
	deadline, _ := ctx.Deadline()
	for i, ip := range addresses {
		// Dial the validated literal IP, never the hostname. TLS and HTTP keep
		// the original hostname for certificate validation, SNI, and Host.
		// Share the remaining connect budget so an unreachable first address
		// does not consume every fallback's opportunity to connect.
		attemptCtx, stop := context.WithTimeout(ctx, time.Until(deadline)/time.Duration(len(addresses)-i))
		conn, err := dialer.DialContext(attemptCtx, network, net.JoinHostPort(ip.String(), port))
		stop()
		if err == nil {
			return conn, nil
		}
		lastErr = err
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}
