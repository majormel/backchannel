import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from mcp.client import Client

from backchannel.server import (
    DEFAULT_MCP_HOST,
    DEFAULT_MCP_PATH,
    DEFAULT_MCP_PORT,
    _build_arg_parser,
    _mcp_transport_options,
    mcp,
)


class TestMCPProtocol(unittest.TestCase):
    def test_2026_protocol_discovery_lists_backchannel_tools(self):
        async def verify():
            async with Client(mcp, mode="auto", raise_exceptions=True) as client:
                self.assertEqual(client.protocol_version, "2026-07-28")
                self.assertEqual(client.server_info.name, "backchannel")
                result = await client.list_tools()
                tool_names = {tool.name for tool in result.tools}
                self.assertIn("mitm_status", tool_names)
                self.assertIn("flows_search", tool_names)

        asyncio.run(verify())

    def test_legacy_protocol_remains_compatible(self):
        async def verify():
            async with Client(mcp, mode="legacy", raise_exceptions=True) as client:
                self.assertEqual(client.protocol_version, "2025-11-25")
                result = await client.list_tools()
                self.assertIn("mitm_status", {tool.name for tool in result.tools})

        asyncio.run(verify())

    def test_mcp_cli_defaults_to_stdio(self):
        with patch.dict(os.environ, {}, clear=True):
            args = _build_arg_parser().parse_args(["mcp"])

        self.assertEqual(args.transport, "stdio")
        self.assertEqual(args.host, DEFAULT_MCP_HOST)
        self.assertEqual(args.port, DEFAULT_MCP_PORT)
        self.assertEqual(args.path, DEFAULT_MCP_PATH)
        self.assertEqual(_mcp_transport_options(args), ("stdio", {}))

    def test_streamable_http_is_stateless_and_loopback_only(self):
        args = SimpleNamespace(
            transport="streamable-http",
            host="127.0.0.1",
            port=8811,
            path="/mcp",
        )

        self.assertEqual(
            _mcp_transport_options(args),
            (
                "streamable-http",
                {
                    "host": "127.0.0.1",
                    "port": 8811,
                    "streamable_http_path": "/mcp",
                    "stateless_http": True,
                },
            ),
        )

        for host in ("0.0.0.0", "192.168.1.10"):
            with self.subTest(host=host):
                args.host = host
                with self.assertRaisesRegex(ValueError, "loopback"):
                    _mcp_transport_options(args)

    def test_streamable_http_rejects_invalid_port_and_path(self):
        args = SimpleNamespace(transport="invalid", host="localhost", port=8811, path="/mcp")
        with self.assertRaisesRegex(ValueError, "stdio or streamable-http"):
            _mcp_transport_options(args)

        for port in (0, 65536):
            with self.subTest(port=port):
                args = SimpleNamespace(transport="streamable-http", host="localhost", port=port, path="/mcp")
                with self.assertRaisesRegex(ValueError, "between 1 and 65535"):
                    _mcp_transport_options(args)

        for path in ("mcp", "/mcp?token=x", "/mcp#fragment"):
            with self.subTest(path=path):
                args = SimpleNamespace(transport="streamable-http", host="::1", port=8811, path=path)
                with self.assertRaisesRegex(ValueError, "absolute URL path"):
                    _mcp_transport_options(args)


if __name__ == "__main__":
    unittest.main()
