package server

import (
	"fmt"
	"net"
)

// ListenLoopback tries to bind 127.0.0.1:preferred. If that port is
// unavailable it scans preferred+1 through preferred+10. It returns the first
// successful net.Listener and the chosen port number.
//
// Only 127.0.0.1 is ever used — never 0.0.0.0 or [::1].
func ListenLoopback(preferred int) (net.Listener, int, error) {
	for port := preferred; port <= preferred+10; port++ {
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		l, err := net.Listen("tcp", addr)
		if err == nil {
			return l, port, nil
		}
	}
	return nil, 0, fmt.Errorf("server: no available loopback port in range %d..%d", preferred, preferred+10)
}
