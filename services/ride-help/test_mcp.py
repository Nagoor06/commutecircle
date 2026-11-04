import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp_server import ask_rider_guide, search_public_rides


class MCPTests(unittest.TestCase):
    def test_real_stdio_handshake_tools_and_guide(self):
        async def exercise():
            params = StdioServerParameters(
                command=sys.executable,
                args=[str(Path(__file__).with_name("mcp_server.py"))],
            )
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as client:
                    await client.initialize()
                    tools = (await client.list_tools()).tools
                    self.assertEqual(
                        {t.name for t in tools},
                        {"read_rider_guide", "ask_rider_guide", "search_public_rides"},
                    )
                    self.assertTrue(all(t.annotations.read_only_hint for t in tools))
                    answer = await client.call_tool("read_rider_guide", {})
                    self.assertFalse(answer.is_error)
                    self.assertIn("Circle pickup privacy", answer.content[0].text)

        asyncio.run(exercise())

    def test_public_search_has_no_credentials_and_has_fallback(self):
        with patch("mcp_server.urlopen") as network:
            network.return_value.__enter__.return_value.read.return_value = (
                b'{"items":[],"more":false}'
            )
            self.assertEqual(search_public_rides("A", "B", 100)["items"], [])
            request = network.call_args.args[0]
            self.assertNotIn("Authorization", request.headers)
            self.assertEqual(json.loads(request.data)["max_fare_paise"], 10000)
        with patch("mcp_server.urlopen", side_effect=OSError):
            self.assertEqual(search_public_rides("A", "B")["status"], "unavailable")
        with patch.dict(
            "os.environ", {"COMMUTECIRCLE_API_ORIGIN": "https://user:secret@host/path"}
        ):
            with self.assertRaises(ValueError):
                search_public_rides("A", "B")

    def test_local_model_failure_is_explicit(self):
        with patch("mcp_server.graph", side_effect=OSError):
            self.assertEqual(ask_rider_guide("Public stops")["status"], "unavailable")
