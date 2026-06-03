# Bài 3: MCP Server in Go — Tích hợp AI vào ứng dụng

**MCP (Model Context Protocol)** ra mắt 11/2024 bởi Anthropic — giao thức chuẩn để AI assistant (Claude, ChatGPT, Cursor) **gọi tool** trên ứng dụng của bạn. Build MCP server cho e-commerce → user nói với Claude Desktop: "Tìm áo size M màu đen dưới 500k" → Claude gọi MCP tool → tìm + đặt hàng tự động. Bài này build MCP server Go from scratch, không dùng SDK.

## MCP là gì?

```text
[Claude Desktop / Cursor / ChatGPT]
            │ JSON-RPC over stdio
            ▼
[MCP Server (your Go binary)]
            │ HTTP/SQL/whatever
            ▼
[Your application / DB / API]
```

MCP standardize cách AI:
- **Discover** capabilities ("anh server có tool gì?")
- **Call** tool với arguments ("tìm product với category=X")
- **Receive** structured response

Trước MCP: mỗi AI app custom plugin. Sau MCP: 1 server xài cho mọi AI client.

## Transport: JSON-RPC 2.0 over stdio

Client spawn server process, communicate qua stdin/stdout:
```text
[Client stdin]   → [Server reads stdin]
                            │
                            ▼
                  [Server writes stdout] → [Client stdout reads]
```

Mỗi message:
- 1 dòng JSON-RPC 2.0.
- `\n` delimiter.

## Project structure

```text
mcp-server/
├── cmd/mcp/main.go
├── internal/
│   ├── jsonrpc/                ← JSON-RPC types
│   │   └── types.go
│   ├── mcp/                    ← MCP protocol
│   │   ├── server.go
│   │   ├── handler.go
│   │   ├── registry.go
│   │   └── types.go
│   ├── tools/                  ← Tool implementations
│   │   ├── ping.go
│   │   ├── product.go
│   │   └── cart.go
│   └── client/                 ← REST client to e-commerce
│       └── api.go
└── go.mod
```

## JSON-RPC types

```go
// internal/jsonrpc/types.go
package jsonrpc

import "encoding/json"

const Version = "2.0"

type Request struct {
    JSONRPC string          `json:"jsonrpc"`
    ID      json.RawMessage `json:"id,omitempty"`     // string hoặc number
    Method  string          `json:"method"`
    Params  json.RawMessage `json:"params,omitempty"`
}

type Response struct {
    JSONRPC string          `json:"jsonrpc"`
    ID      json.RawMessage `json:"id"`
    Result  any             `json:"result,omitempty"`
    Error   *Error          `json:"error,omitempty"`
}

type Error struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    Data    any    `json:"data,omitempty"`
}

// Standard error codes
const (
    ParseError     = -32700
    InvalidRequest = -32600
    MethodNotFound = -32601
    InvalidParams  = -32602
    InternalError  = -32603
)

func NewError(code int, msg string) *Error {
    return &Error{Code: code, Message: msg}
}

func NewResponse(id json.RawMessage, result any) *Response {
    return &Response{JSONRPC: Version, ID: id, Result: result}
}

func NewErrorResponse(id json.RawMessage, err *Error) *Response {
    return &Response{JSONRPC: Version, ID: id, Error: err}
}
```

## MCP types

```go
// internal/mcp/types.go
package mcp

type InitializeParams struct {
    ProtocolVersion string                 `json:"protocolVersion"`
    Capabilities    map[string]any         `json:"capabilities"`
    ClientInfo      ClientInfo             `json:"clientInfo"`
}

type ClientInfo struct {
    Name    string `json:"name"`
    Version string `json:"version"`
}

type InitializeResult struct {
    ProtocolVersion string         `json:"protocolVersion"`
    Capabilities    Capabilities   `json:"capabilities"`
    ServerInfo      ServerInfo     `json:"serverInfo"`
}

type Capabilities struct {
    Tools map[string]any `json:"tools,omitempty"`
}

type ServerInfo struct {
    Name    string `json:"name"`
    Version string `json:"version"`
}

// Tool definition
type Tool struct {
    Name        string         `json:"name"`
    Description string         `json:"description"`
    InputSchema map[string]any `json:"inputSchema"`     // JSON schema
}

type ListToolsResult struct {
    Tools []Tool `json:"tools"`
}

type CallToolParams struct {
    Name      string         `json:"name"`
    Arguments map[string]any `json:"arguments"`
}

type CallToolResult struct {
    Content []Content `json:"content"`
    IsError bool      `json:"isError,omitempty"`
}

type Content struct {
    Type string `json:"type"`     // "text"
    Text string `json:"text"`
}
```

## Tool interface + registry

```go
// internal/mcp/registry.go
package mcp

type ToolHandler interface {
    Definition() Tool
    Execute(ctx context.Context, args map[string]any) (string, error)
}

type Registry struct {
    tools map[string]ToolHandler
}

func NewRegistry() *Registry {
    return &Registry{tools: map[string]ToolHandler{}}
}

func (r *Registry) Register(h ToolHandler) {
    def := h.Definition()
    r.tools[def.Name] = h
}

func (r *Registry) List() []Tool {
    out := make([]Tool, 0, len(r.tools))
    for _, h := range r.tools {
        out = append(out, h.Definition())
    }
    return out
}

func (r *Registry) Get(name string) (ToolHandler, bool) {
    h, ok := r.tools[name]
    return h, ok
}
```

## Server implementation

```go
// internal/mcp/server.go
package mcp

import (
    "bufio"
    "context"
    "encoding/json"
    "fmt"
    "io"
)

type Server struct {
    registry *Registry
    name     string
    version  string
    log      *slog.Logger
}

func NewServer(name, version string, log *slog.Logger) *Server {
    return &Server{
        registry: NewRegistry(),
        name:     name,
        version:  version,
        log:      log,
    }
}

func (s *Server) Register(h ToolHandler) {
    s.registry.Register(h)
}

func (s *Server) Run(ctx context.Context, in io.Reader, out io.Writer) error {
    scanner := bufio.NewScanner(in)
    scanner.Buffer(make([]byte, 1024*1024), 1024*1024*10)   // 10MB max line
    
    writer := bufio.NewWriter(out)
    defer writer.Flush()
    
    for scanner.Scan() {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
        }
        
        line := scanner.Bytes()
        if len(line) == 0 { continue }
        
        var req jsonrpc.Request
        if err := json.Unmarshal(line, &req); err != nil {
            s.writeError(writer, nil, jsonrpc.ParseError, err.Error())
            continue
        }
        
        s.handleRequest(ctx, writer, &req)
    }
    
    return scanner.Err()
}

func (s *Server) handleRequest(ctx context.Context, w io.Writer, req *jsonrpc.Request) {
    switch req.Method {
    case "initialize":
        s.handleInitialize(w, req)
    case "tools/list":
        s.handleListTools(w, req)
    case "tools/call":
        s.handleCallTool(ctx, w, req)
    case "notifications/initialized":
        // No response needed
    default:
        s.writeError(w, req.ID, jsonrpc.MethodNotFound,
            "method not found: "+req.Method)
    }
}

func (s *Server) handleInitialize(w io.Writer, req *jsonrpc.Request) {
    result := InitializeResult{
        ProtocolVersion: "2024-11-05",
        Capabilities: Capabilities{
            Tools: map[string]any{},
        },
        ServerInfo: ServerInfo{Name: s.name, Version: s.version},
    }
    s.writeResponse(w, req.ID, result)
}

func (s *Server) handleListTools(w io.Writer, req *jsonrpc.Request) {
    result := ListToolsResult{Tools: s.registry.List()}
    s.writeResponse(w, req.ID, result)
}

func (s *Server) handleCallTool(ctx context.Context, w io.Writer, req *jsonrpc.Request) {
    var params CallToolParams
    if err := json.Unmarshal(req.Params, &params); err != nil {
        s.writeError(w, req.ID, jsonrpc.InvalidParams, err.Error())
        return
    }
    
    handler, ok := s.registry.Get(params.Name)
    if !ok {
        s.writeError(w, req.ID, jsonrpc.MethodNotFound,
            "tool not found: "+params.Name)
        return
    }
    
    text, err := handler.Execute(ctx, params.Arguments)
    if err != nil {
        s.writeResponse(w, req.ID, CallToolResult{
            Content: []Content{{Type: "text", Text: err.Error()}},
            IsError: true,
        })
        return
    }
    
    s.writeResponse(w, req.ID, CallToolResult{
        Content: []Content{{Type: "text", Text: text}},
    })
}

func (s *Server) writeResponse(w io.Writer, id json.RawMessage, result any) {
    resp := jsonrpc.NewResponse(id, result)
    data, _ := json.Marshal(resp)
    fmt.Fprintln(w, string(data))
    if f, ok := w.(*bufio.Writer); ok { f.Flush() }
}

func (s *Server) writeError(w io.Writer, id json.RawMessage, code int, msg string) {
    resp := jsonrpc.NewErrorResponse(id, &jsonrpc.Error{Code: code, Message: msg})
    data, _ := json.Marshal(resp)
    fmt.Fprintln(w, string(data))
}
```

## Tool: Ping

```go
// internal/tools/ping.go
package tools

type PingTool struct{}

func (PingTool) Definition() mcp.Tool {
    return mcp.Tool{
        Name:        "ping",
        Description: "Test if MCP server is alive",
        InputSchema: map[string]any{
            "type":       "object",
            "properties": map[string]any{},
        },
    }
}

func (PingTool) Execute(ctx context.Context, args map[string]any) (string, error) {
    return "pong", nil
}
```

## Tool: Product search

```go
// internal/tools/product.go
type ProductSearchTool struct {
    client *client.APIClient
}

func (ProductSearchTool) Definition() mcp.Tool {
    return mcp.Tool{
        Name:        "product_search",
        Description: "Search e-commerce products by query string",
        InputSchema: map[string]any{
            "type": "object",
            "properties": map[string]any{
                "query": map[string]any{
                    "type":        "string",
                    "description": "Search keywords (e.g. 'running shoes')",
                },
                "category": map[string]any{
                    "type":        "string",
                    "description": "Filter by category",
                },
                "limit": map[string]any{
                    "type":        "integer",
                    "description": "Max results (default 10, max 50)",
                },
            },
            "required": []string{"query"},
        },
    }
}

func (t ProductSearchTool) Execute(ctx context.Context, args map[string]any) (string, error) {
    query, ok := args["query"].(string)
    if !ok || query == "" {
        return "", fmt.Errorf("query required")
    }
    
    limit := 10
    if l, ok := args["limit"].(float64); ok {
        limit = int(l)
    }
    if limit > 50 { limit = 50 }
    
    category, _ := args["category"].(string)
    
    result, err := t.client.SearchProducts(ctx, query, category, limit)
    if err != nil {
        return "", fmt.Errorf("search: %w", err)
    }
    
    var sb strings.Builder
    sb.WriteString(fmt.Sprintf("Found %d products:\n\n", result.Total))
    for i, p := range result.Products {
        sb.WriteString(fmt.Sprintf("%d. **%s** (ID: %s)\n   Brand: %s\n   Price: $%.2f\n   %s\n\n",
            i+1, p.Name, p.ID, p.Brand, p.Price, truncate(p.Description, 100)))
    }
    return sb.String(), nil
}
```

## Tool: Add to cart

```go
type AddToCartTool struct {
    client *client.APIClient
}

func (AddToCartTool) Definition() mcp.Tool {
    return mcp.Tool{
        Name:        "add_to_cart",
        Description: "Add product to user's shopping cart",
        InputSchema: map[string]any{
            "type": "object",
            "properties": map[string]any{
                "product_id": map[string]any{"type": "string"},
                "quantity":   map[string]any{"type": "integer", "minimum": 1},
            },
            "required": []string{"product_id", "quantity"},
        },
    }
}

func (t AddToCartTool) Execute(ctx context.Context, args map[string]any) (string, error) {
    productID, _ := args["product_id"].(string)
    qty := int(args["quantity"].(float64))
    
    if err := t.client.AddToCart(ctx, productID, qty); err != nil {
        return "", err
    }
    
    return fmt.Sprintf("Added %d x product %s to cart", qty, productID), nil
}
```

## main.go

```go
package main

import (
    "context"
    "log/slog"
    "os"
    "os/signal"
    "syscall"
    
    "github.com/yourname/mcp-server/internal/mcp"
    "github.com/yourname/mcp-server/internal/tools"
    "github.com/yourname/mcp-server/internal/client"
)

func main() {
    log := slog.New(slog.NewTextHandler(os.Stderr, nil))   // log to STDERR — stdout cho protocol
    
    apiClient := client.New(os.Getenv("API_BASE_URL"), os.Getenv("API_TOKEN"))
    
    s := mcp.NewServer("ecommerce-mcp", "1.0", log)
    s.Register(tools.PingTool{})
    s.Register(tools.ProductSearchTool{Client: apiClient})
    s.Register(tools.ProductDetailsTool{Client: apiClient})
    s.Register(tools.AddToCartTool{Client: apiClient})
    s.Register(tools.GetCartTool{Client: apiClient})
    s.Register(tools.PlaceOrderTool{Client: apiClient})
    
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer stop()
    
    if err := s.Run(ctx, os.Stdin, os.Stdout); err != nil {
        log.Error("server", "error", err)
        os.Exit(1)
    }
}
```

**Quan trọng**: log to **stderr** vì stdout dùng cho JSON-RPC protocol.

## Claude Desktop config

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (Mac)
{
  "mcpServers": {
    "ecommerce": {
      "command": "/Users/you/go/bin/ecommerce-mcp",
      "env": {
        "API_BASE_URL": "http://localhost:8080",
        "API_TOKEN": "your-jwt-token"
      }
    }
  }
}
```

Restart Claude Desktop → MCP server spawn → tools available.

## Test với MCP Inspector

```bash
npm install -g @modelcontextprotocol/inspector
npx @modelcontextprotocol/inspector /path/to/ecommerce-mcp
```

→ Web UI test tool call, xem schema, response.

## User experience

```text
User → Claude: "Tìm giày chạy bộ Nike size 42 dưới 2 triệu"

Claude (decides to call MCP tool):
→ product_search(query="Nike running shoes size 42", limit=10)

MCP Server → Backend API:
GET /api/products/search?q=Nike+running+shoes+size+42

Response → Claude:
"Found 5 products: ..."

Claude → User:
"Tôi tìm thấy 5 sản phẩm phù hợp:
1. Nike Pegasus 40 — 1.85 triệu — còn 5 đôi
2. Nike Revolution 6 — 1.2 triệu — còn 3 đôi
..."

User: "Đặt đôi #2 cho tôi"

Claude:
→ add_to_cart(product_id="2", quantity=1)
→ place_order()

User: "Tôi đã đặt thành công."
```

→ Natural language → action thật trên hệ thống. Đây là tương lai UX.

## Security cho MCP

MCP server có quyền thực hiện hành động critical (place order, modify data). Phải:

```text
✓ Authentication: token per user, không shared
✓ Authorization: tool check permission
✓ Audit log: mỗi tool call → log với user + args
✓ Rate limit per user
✓ Confirmation cho action destructive (cancel, delete, large payment)
✓ Sandbox: read-only mode mặc định, write tools opt-in
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Log to stdout | Mess protocol | Log to stderr |
| Tool no schema | Claude không gọi đúng | Detailed JSON schema |
| Tool description vague | Claude pick sai | Mô tả rõ ràng + example |
| No auth in tool | User A access data User B | Verify token mỗi call |
| Tool slow blocking | Claude timeout | Async + progress |
| Large response | Claude context overflow | Truncate + pagination |
| Tool side-effect không idempotent | Duplicate order | Idempotency key |
| Hard-code path | Deploy fail | Env var |

## Tóm tắt bài 3

- MCP = giao thức chuẩn cho AI assistant gọi tool ứng dụng.
- Transport: JSON-RPC 2.0 over stdio (line-delimited JSON).
- Methods: `initialize`, `tools/list`, `tools/call`.
- Tool: `Name`, `Description`, `InputSchema` (JSON schema), `Execute`.
- Registry pattern: register handler, dispatch theo name.
- Log to **stderr** (stdout dùng cho protocol).
- Claude Desktop config: spawn binary với env var.
- MCP Inspector cho dev test.
- Security: auth, audit, rate limit, confirmation cho destructive action.

🎉 **Hoàn thành Phase 15** — GraphQL + Mocking + Search + MCP — toolkit modern Go full-stack.

**Bài kế tiếp** → [Bài 4: Course Summary + Roadmap nâng cao](04-course-summary.md)
