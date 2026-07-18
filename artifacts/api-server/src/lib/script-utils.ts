export function toSessionJson(s: any) {
  return {
    id: s.id,
    originalName: s.originalName ?? s.original_name,
    status: s.status,
    scriptCount: s.scriptCount ?? s.script_count ?? 0,
    errorMessage: s.errorMessage ?? s.error_message ?? null,
    fileSizeBytes: s.fileSizeBytes ?? s.file_size_bytes ?? null,
    createdAt:
      (s.createdAt ?? s.created_at)?.toISOString?.() ?? s.createdAt,
  };
}

export function toScriptJson(s: any) {
  return {
    id: s.id,
    sessionId: s.sessionId ?? s.session_id,
    name: s.name,
    scriptType: s.scriptType ?? s.script_type,
    scriptPath: s.scriptPath ?? s.script_path,
    sizeBytes: s.sizeBytes ?? s.size_bytes,
    isBytecode: s.isBytecode ?? s.is_bytecode,
    createdAt:
      (s.createdAt ?? s.created_at)?.toISOString?.() ?? s.createdAt,
  };
}

export function toTopicJson(t: any) {
  return {
    id: t.id,
    sessionId: t.sessionId ?? t.session_id,
    name: t.name,
    category: t.category,
    matchCount: t.matchCount ?? t.match_count,
    createdAt:
      (t.createdAt ?? t.created_at)?.toISOString?.() ?? t.createdAt,
  };
}
