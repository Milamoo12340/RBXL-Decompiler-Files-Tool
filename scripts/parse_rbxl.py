#!/usr/bin/env python3
"""
RBXL Binary Format Parser
Extracts Lua scripts from Roblox binary place/model files (.rbxl / .rbxm)

Supports:
  - LZ4 block decompression (pure Python)
  - INST / PROP / PRNT / SSTR chunk parsing
  - Script, LocalScript, ModuleScript extraction
  - Path reconstruction from instance hierarchy
"""

import struct
import sys
import json
import os

MAGIC = b'<roblox!\x89\xff\r\n\x1a\n'

# ── LZ4 block decompression ───────────────────────────────────────────────────

def lz4_decompress(src: bytes, expected_len: int) -> bytes:
    dst = bytearray()
    src_pos = 0
    src_len = len(src)

    while src_pos < src_len:
        token = src[src_pos]; src_pos += 1

        # Literal length
        lit_len = (token >> 4) & 0xF
        if lit_len == 15:
            while src_pos < src_len:
                b = src[src_pos]; src_pos += 1
                lit_len += b
                if b != 255:
                    break

        # Copy literals
        end = src_pos + lit_len
        dst += src[src_pos:end]
        src_pos = end

        if src_pos >= src_len:
            break

        # Match offset (2 bytes LE)
        if src_pos + 1 >= src_len:
            break
        offset = src[src_pos] | (src[src_pos + 1] << 8)
        src_pos += 2

        if offset == 0:
            break

        # Match length
        match_len = (token & 0xF) + 4
        if (token & 0xF) == 15:
            while src_pos < src_len:
                b = src[src_pos]; src_pos += 1
                match_len += b
                if b != 255:
                    break

        # Copy from output (overlap-safe)
        match_start = len(dst) - offset
        if match_start < 0:
            break
        for i in range(match_len):
            dst.append(dst[match_start + i])

    return bytes(dst)


# ── Helpers ───────────────────────────────────────────────────────────────────

def read_string(data: bytes, pos: int):
    """Read 4-byte length-prefixed string, return (str_bytes, new_pos)."""
    if pos + 4 > len(data):
        return b'', pos
    length = struct.unpack_from('<I', data, pos)[0]
    pos += 4
    s = data[pos:pos + length]
    pos += length
    return s, pos


def decode_referent_array(data: bytes, n: int):
    """Decode interleaved big-endian delta-encoded uint32 referent array."""
    if len(data) < n * 4:
        return []
    values = []
    acc = 0
    for i in range(n):
        b0 = data[i]
        b1 = data[i + n]
        b2 = data[i + 2 * n]
        b3 = data[i + 3 * n]
        val = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
        acc += val
        values.append(acc)
    return values


# ── Chunk parsers ─────────────────────────────────────────────────────────────

def parse_inst_chunk(data: bytes, type_map: dict, instance_type: dict, instance_ids_by_type: dict):
    pos = 0
    if len(data) < 9:
        return
    type_id = struct.unpack_from('<I', data, pos)[0]; pos += 4
    class_name_bytes, pos = read_string(data, pos)
    class_name = class_name_bytes.decode('utf-8', errors='replace')
    # skip is_service byte
    pos += 1
    if pos + 4 > len(data):
        return
    num_instances = struct.unpack_from('<I', data, pos)[0]; pos += 4

    raw = data[pos:pos + num_instances * 4]
    ids = decode_referent_array(raw, num_instances)

    type_map[type_id] = class_name
    instance_ids_by_type[type_id] = ids
    for iid in ids:
        instance_type[iid] = class_name


def parse_prop_chunk(data: bytes, instance_ids_by_type: dict, properties: dict):
    pos = 0
    if len(data) < 9:
        return
    type_id = struct.unpack_from('<I', data, pos)[0]; pos += 4
    prop_name_bytes, pos = read_string(data, pos)
    prop_name = prop_name_bytes.decode('utf-8', errors='replace')

    if pos >= len(data):
        return
    data_type = data[pos]; pos += 1

    instance_ids = instance_ids_by_type.get(type_id, [])
    if not instance_ids:
        return

    # Only parse property types we care about for scripts
    # 0x01 = String, 0x13 = ProtectedString (Luau source code)
    if data_type in (0x01, 0x13):
        for iid in instance_ids:
            if pos + 4 > len(data):
                break
            s, pos = read_string(data, pos)
            if iid not in properties:
                properties[iid] = {}
            properties[iid][prop_name] = s.decode('utf-8', errors='replace')

    # 0x02 = Bool (not needed but skip safely)
    # Skip all other types — we only need Source and Name


def parse_prnt_chunk(data: bytes, parent_map: dict):
    pos = 0
    if len(data) < 5:
        return
    # version byte
    pos += 1
    num_pairs = struct.unpack_from('<I', data, pos)[0]; pos += 4

    child_raw = data[pos:pos + num_pairs * 4]; pos += num_pairs * 4
    parent_raw = data[pos:pos + num_pairs * 4]

    child_ids = decode_referent_array(child_raw, num_pairs)
    parent_ids = decode_referent_array(parent_raw, num_pairs)

    for child, parent in zip(child_ids, parent_ids):
        parent_map[child] = parent


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_rbxl(filepath: str):
    with open(filepath, 'rb') as f:
        data = f.read()

    pos = 0

    # Validate magic
    if len(data) < len(MAGIC) or data[pos:pos + len(MAGIC)] != MAGIC:
        raise ValueError('Not a valid RBXL binary file (bad magic)')
    pos += len(MAGIC)

    # Header: version (2), num_types (4), num_instances (4), reserved (8)
    if pos + 18 > len(data):
        raise ValueError('File too short for header')
    version = struct.unpack_from('<H', data, pos)[0]; pos += 2
    num_types = struct.unpack_from('<I', data, pos)[0]; pos += 4
    num_instances = struct.unpack_from('<I', data, pos)[0]; pos += 4
    pos += 8  # reserved

    type_map = {}          # type_id -> class_name
    instance_type = {}     # instance_id -> class_name
    instance_ids_by_type = {}  # type_id -> [instance_ids]
    properties = {}        # instance_id -> {prop_name -> value}
    parent_map = {}        # instance_id -> parent_id

    errors = []

    while pos + 16 <= len(data):
        chunk_type = data[pos:pos + 4]; pos += 4
        compressed_len = struct.unpack_from('<I', data, pos)[0]; pos += 4
        uncompressed_len = struct.unpack_from('<I', data, pos)[0]; pos += 4
        pos += 4  # reserved

        if compressed_len == 0:
            chunk_data = data[pos:pos + uncompressed_len]
            pos += uncompressed_len
        else:
            if pos + compressed_len > len(data):
                break
            compressed_data = data[pos:pos + compressed_len]
            pos += compressed_len
            try:
                chunk_data = lz4_decompress(compressed_data, uncompressed_len)
            except Exception as e:
                errors.append(f'LZ4 error in {chunk_type}: {e}')
                continue

        if chunk_type == b'END\x00':
            break
        elif chunk_type == b'INST':
            try:
                parse_inst_chunk(chunk_data, type_map, instance_type, instance_ids_by_type)
            except Exception as e:
                errors.append(f'INST error: {e}')
        elif chunk_type == b'PROP':
            try:
                parse_prop_chunk(chunk_data, instance_ids_by_type, properties)
            except Exception as e:
                errors.append(f'PROP error: {e}')
        elif chunk_type == b'PRNT':
            try:
                parse_prnt_chunk(chunk_data, parent_map)
            except Exception as e:
                errors.append(f'PRNT error: {e}')

    # ── Collect scripts ───────────────────────────────────────────────────────
    script_classes = {'Script', 'LocalScript', 'ModuleScript'}
    scripts = []

    for iid, class_name in instance_type.items():
        if class_name not in script_classes:
            continue
        props = properties.get(iid, {})
        source = props.get('Source', '')
        name = props.get('Name', f'Script_{iid}')

        # Build path from hierarchy
        path_parts = [name]
        current = iid
        visited = set()
        for _ in range(64):
            parent = parent_map.get(current, -1)
            if parent == -1 or parent == current or parent in visited:
                break
            visited.add(parent)
            parent_name = properties.get(parent, {}).get('Name', f'_{parent}')
            path_parts.insert(0, parent_name)
            current = parent

        encoded = source.encode('utf-8', errors='replace') if source else b''
        is_bytecode = source.startswith('\x1bLuau') or source.startswith('\x1bLua') if source else False

        scripts.append({
            'instance_id': iid,
            'name': name,
            'class': class_name,
            'path': '/'.join(path_parts),
            'source': source,
            'size': len(encoded),
            'is_bytecode': is_bytecode,
        })

    return {
        'success': True,
        'version': version,
        'num_types': num_types,
        'num_instances': num_instances,
        'script_count': len(scripts),
        'scripts': scripts,
        'errors': errors,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: parse_rbxl.py <file.rbxl>', 'success': False}))
        sys.exit(1)

    try:
        result = parse_rbxl(sys.argv[1])
        # Strip source from output for listing (too large) — unless --full flag
        if '--full' not in sys.argv:
            for s in result['scripts']:
                # Keep first 500 chars for preview
                src = s.get('source', '')
                s['preview'] = src[:500] if src else ''
                del s['source']
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        import traceback
        print(json.dumps({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }))
        sys.exit(1)
