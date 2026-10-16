"""Protocol integration tests: the official SDK launches a real stdio process."""
import asyncio
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from mcp import Client, ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from conftest import make_image_bytes

BACKEND = Path(__file__).resolve().parents[1]
TOOLS = {"get_server_status", "list_drafts", "get_draft", "create_draft", "update_draft",
         "record_vinted_status", "prepare_vinted_transfer", "delete_draft"}


def parameters(tmp_path, *, photo_root=True):
    photos = tmp_path / "photos"
    photos.mkdir(exist_ok=True)
    (photos / "real.jpg").write_bytes(make_image_bytes())
    env = dict(os.environ, PYTHONPATH=str(BACKEND), PYTHONDONTWRITEBYTECODE="1")
    args = ["-B", "-m", "vinted_assistant.mcp_server", "--data-dir", str(tmp_path / "data")]
    if photo_root:
        args += ["--photo-root", str(photos)]
    # Working directory deliberately differs from the repository.
    return StdioServerParameters(command=sys.executable, args=args, env=env, cwd=str(tmp_path))


async def tool(client, name, arguments=None):
    result = await client.call_tool(name, arguments or {})
    assert not result.is_error, result
    assert result.structured_content is not None
    return result.structured_content


def test_mcp_modern_stdio_crud_resources_prompt_and_restart(tmp_path):
    async def scenario():
        launch = parameters(tmp_path)
        async with Client(stdio_client(launch)) as client:
            assert {item.name for item in (await client.list_tools()).tools} == TOOLS
            info = await tool(client, "get_server_status")
            assert info["photo_import_enabled"] is True
            empty = await tool(client, "list_drafts")
            assert empty["items"] == []
            listing = await tool(client, "create_draft", {
                "photo_paths": ["real.jpg"],
                "details": {"note": "Libro sigillato", "item_type": "libro", "explicit_price": 19.9},
            })
            listing_id = listing["id"]
            assert listing["status"] == "ready"
            assert listing["price"] == 19.9
            assert (tmp_path / "photos" / "real.jpg").exists()
            updated = await tool(client, "update_draft", {
                "listing_id": listing_id, "changes": {"title": "Titolo verificato", "price": 22.5}
            })
            assert updated["title"] == "Titolo verificato"
            assert updated["price"] == 22.5
            transfer = await tool(client, "prepare_vinted_transfer", {"listing_id": listing_id})
            assert transfer["vinted_url"] == f"https://www.vinted.it/items/new#vinted-assistant={listing_id}"
            assert (await tool(client, "get_draft", {"listing_id": listing_id}))["status"] == "ready"
            resources = await client.list_resources()
            assert "vinted://queue" in {str(item.uri) for item in resources.resources}
            templates = await client.list_resource_templates()
            assert any("listing_id" in item.uri_template for item in templates.resource_templates)
            resource = await client.read_resource(f"vinted://drafts/{listing_id}")
            assert json.loads(resource.contents[0].text)["id"] == listing_id
            assert "review_draft" in {p.name for p in (await client.list_prompts()).prompts}
            prompt = await client.get_prompt("review_draft", {"listing_id": listing_id})
            assert "Titolo verificato" in prompt.messages[0].content.text
            marked = await tool(client, "record_vinted_status", {
                "listing_id": listing_id, "status": "vinted_draft", "confirmed_on_vinted": True,
            })
            assert marked["status"] == "vinted_draft"
        # New process, same SQLite store; no HTTP server has been started.
        async with Client(stdio_client(launch)) as client:
            persisted = await tool(client, "get_draft", {"listing_id": listing_id})
            assert persisted["price"] == 22.5
            assert persisted["status"] == "vinted_draft"
            page = await tool(client, "list_drafts", {"status": "vinted_draft", "limit": 1})
            assert len(page["items"]) == 1 and page["has_more"] is False
            result = await tool(client, "delete_draft", {"listing_id": listing_id, "confirm_delete": True})
            assert result["deleted"] is True
            assert (await tool(client, "list_drafts"))["items"] == []
        assert list((tmp_path / "data" / "uploads").iterdir()) == []
        assert (tmp_path / "photos" / "real.jpg").exists()
    asyncio.run(scenario())


def test_mcp_rejects_bad_arguments_outside_photos_and_unconfirmed_remote_state(tmp_path):
    async def scenario():
        launch = parameters(tmp_path)
        (tmp_path / "outside.jpg").write_bytes(make_image_bytes())
        (tmp_path / "photos" / "fake.jpg").write_text("not a photo")
        async with Client(stdio_client(launch)) as client:
            listing = await tool(client, "create_draft", {
                "photo_paths": ["real.jpg"], "details": {"note": "Articolo verificato"}
            })
            identifier = listing["id"]
            cases = [
                ("create_draft", {"photo_paths": ["../outside.jpg"], "details": {"note": "Prova"}}),
                ("create_draft", {"photo_paths": ["fake.jpg"], "details": {"note": "Prova"}}),
                ("create_draft", {"photo_paths": [], "details": {"note": "Prova"}}),
                ("create_draft", {"photo_paths": ["real.jpg"], "details": {"note": " "}}),
                ("update_draft", {"listing_id": identifier, "changes": {"price": None}}),
                ("update_draft", {"listing_id": identifier, "changes": {"status": "published"}}),
                ("update_draft", {"listing_id": identifier, "changes": {"price": -1}}),
                ("record_vinted_status", {"listing_id": identifier, "status": "published"}),
                ("delete_draft", {"listing_id": identifier}),
                ("get_draft", {"listing_id": str(uuid4())}),
                ("list_drafts", {"limit": 1000}),
            ]
            for name, arguments in cases:
                result = await client.call_tool(name, arguments)
                assert result.is_error, (name, arguments, result)
            saved = await tool(client, "get_draft", {"listing_id": identifier})
            assert saved["status"] == "ready"
            assert len((await tool(client, "list_drafts"))["items"]) == 1
    asyncio.run(scenario())


def test_mcp_legacy_initialize_and_import_disabled_without_root(tmp_path):
    async def scenario():
        async with stdio_client(parameters(tmp_path, photo_root=False)) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=20) as session:
                init = await session.initialize()
                assert init.server_info.name == "Vinted Assistant"
                assert {item.name for item in (await session.list_tools()).tools} == TOOLS
                info = await tool(session, "get_server_status")
                assert info["photo_import_enabled"] is False
                result = await session.call_tool("create_draft", {
                    "photo_paths": [str(tmp_path / "photos" / "real.jpg")],
                    "details": {"note": "Articolo"},
                })
                assert result.is_error
    asyncio.run(scenario())
