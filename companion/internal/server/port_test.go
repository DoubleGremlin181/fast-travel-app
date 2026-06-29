package server_test

import (
	"net"
	"testing"

	"github.com/DoubleGremlin181/fast-travel-app/companion/internal/server"
)

func TestListenLoopback_BindsLoopback(t *testing.T) {
	l, port, err := server.ListenLoopback(7333)
	if err != nil {
		t.Fatalf("ListenLoopback(7333): %v", err)
	}
	defer l.Close()

	if port < 7333 || port > 7343 {
		t.Errorf("port %d out of expected range 7333..7343", port)
	}

	addr, ok := l.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener addr is not *net.TCPAddr: %T", l.Addr())
	}
	if !addr.IP.IsLoopback() {
		t.Errorf("listener IP %v is not loopback", addr.IP)
	}
	if addr.Port != port {
		t.Errorf("reported port %d != listener port %d", port, addr.Port)
	}
}

func TestListenLoopback_FallsThrough(t *testing.T) {
	// Grab a free port from the OS, then keep it occupied.
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("cannot bind test port: %v", err)
	}
	defer occupied.Close()

	preferredPort := occupied.Addr().(*net.TCPAddr).Port

	// ListenLoopback must skip the occupied port and bind the next one.
	l, gotPort, err := server.ListenLoopback(preferredPort)
	if err != nil {
		t.Fatalf("ListenLoopback(%d): %v", preferredPort, err)
	}
	defer l.Close()

	if gotPort == preferredPort {
		t.Errorf("expected fallthrough to a different port, got %d == preferred %d", gotPort, preferredPort)
	}
	if gotPort < preferredPort || gotPort > preferredPort+10 {
		t.Errorf("fallthrough port %d not in range [%d, %d+10]", gotPort, preferredPort, preferredPort)
	}
}

func TestListenLoopback_ClosedListenerCanBeRebound(t *testing.T) {
	l, port, err := server.ListenLoopback(7335)
	if err != nil {
		t.Fatalf("first ListenLoopback: %v", err)
	}
	l.Close()

	// After closing, the same port should be bindable again.
	l2, port2, err := server.ListenLoopback(port)
	if err != nil {
		t.Fatalf("second ListenLoopback: %v", err)
	}
	defer l2.Close()

	if port2 != port {
		t.Errorf("expected same port %d after rebind, got %d", port, port2)
	}
}
