"use client";

import { useState } from "react";
import { ApiKeys, Project, Question } from "@/lib/types";
import { api } from "@/lib/client";

interface Props {
  project: Project;
  question: Question;
  index: number;
  keys: ApiKeys;
  onProject: (p: Project) => void;
  onChange: (q: Question) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}

export default function QuestionCard({
  project,
  question: q,
  index,
  keys,
  onProject,
  onChange,
  onDelete,
  onMove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState<{ side: "a" | "b"; query: string } | null>(null);
  const [candidates, setCandidates] = useState<{ side: "a" | "b"; items: { src: string; sourceUrl?: string }[] } | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const search = (side: "a" | "b", query: string) =>
    run(`search-${side}`, async () => {
      const r = await api<{ candidates: { src: string; sourceUrl?: string }[] }>(
        "/api/images",
        {
          projectId: project.id,
          action: "search",
          query,
          provider: project.settings.imageProvider,
          keys,
        }
      );
      setCandidates({ side, items: r.candidates.slice(0, 8) });
    });

  const setImage = (side: "a" | "b", src: string, sourceUrl?: string) =>
    run(`set-${side}`, async () => {
      const r = await api("/api/images", {
        projectId: project.id,
        action: "set",
        questionId: q.id,
        side,
        src,
        sourceUrl,
      });
      onProject(r.project);
      setCandidates(null);
    });

  const generateImage = (side: "a" | "b") =>
    run(`gen-${side}`, async () => {
      const r = await api("/api/images", {
        projectId: project.id,
        action: "generate",
        questionId: q.id,
        side,
        query: side === "a" ? q.optionA.imageQuery : q.optionB.imageQuery,
        keys,
      });
      onProject(r.project);
    });

  const regenAudio = () =>
    run("audio", async () => {
      const r = await api("/api/tts", {
        projectId: project.id,
        apiKey: keys.elevenlabs,
        questionId: q.id,
      });
      onProject(r.project);
    });

  const renderOption = (side: "a" | "b") => {
    const opt = side === "a" ? q.optionA : q.optionB;
    const setOpt = (patch: Partial<typeof opt>) =>
      onChange(
        side === "a"
          ? { ...q, optionA: { ...q.optionA, ...patch } }
          : { ...q, optionB: { ...q.optionB, ...patch } }
      );
    return (
      <div className="opt-row">
        <div>
          <div className={`opt-tag ${side}`}>{side === "a" ? "КРАСНОЕ" : "СИНЕЕ"}</div>
          {opt.image?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="thumb"
              src={opt.image.src}
              alt={opt.text}
              title="Найти другую картинку"
              onClick={() => search(side, opt.imageQuery)}
              style={{ marginTop: 6 }}
            />
          ) : (
            <div
              className="thumb empty"
              style={{ marginTop: 6 }}
              onClick={() => search(side, opt.imageQuery)}
            >
              нет картинки — нажми для поиска
            </div>
          )}
        </div>
        <label className="field">
          <span>Подпись на экране</span>
          <input
            type="text"
            value={opt.text}
            onChange={(e) => setOpt({ text: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Запрос для картинки (англ.)</span>
          <input
            type="text"
            value={opt.imageQuery}
            onChange={(e) => setOpt({ imageQuery: e.target.value })}
          />
          <div className="row" style={{ marginTop: 6 }}>
            <button
              className="secondary small"
              disabled={!!busy}
              onClick={() => search(side, opt.imageQuery)}
            >
              {busy === `search-${side}` ? <span className="spinner" /> : null}
              Найти фото
            </button>
            <button
              className="secondary small"
              disabled={!!busy || !keys.openai}
              title={keys.openai ? "Сгенерировать картинку (OpenAI)" : "Нужен OpenAI ключ"}
              onClick={() => generateImage(side)}
            >
              {busy === `gen-${side}` ? <span className="spinner" /> : null}
              AI-картинка
            </button>
          </div>
        </label>
      </div>
    );
  };

  return (
    <div className="qcard">
      <div className="qhead">
        <div className="row">
          <strong>#{index + 1}</strong>
          {q.kind === "cta" && <span className="badge cta">CTA</span>}
          {q.audio && (
            <span className="badge audio">
              озвучка {q.audio.duration.toFixed(1)}с
            </span>
          )}
        </div>
        <div className="row">
          <button className="secondary small" onClick={() => onMove(-1)}>↑</button>
          <button className="secondary small" onClick={() => onMove(1)}>↓</button>
          <button className="secondary small" onClick={() => setOpen(!open)}>
            {open ? "Свернуть" : "Настройки"}
          </button>
          <button className="danger small" onClick={onDelete}>✕</button>
        </div>
      </div>

      <label className="field">
        <span>Текст озвучки (читается голосом, формат «А или Б?»)</span>
        <textarea
          value={q.voiceText}
          onChange={(e) => onChange({ ...q, voiceText: e.target.value, audio: undefined })}
        />
      </label>

      {renderOption("a")}
      {renderOption("b")}

      {candidates && (
        <div>
          <div className="muted">Выбери картинку для «{candidates.side === "a" ? q.optionA.text : q.optionB.text}»:</div>
          <div className="row" style={{ margin: "6px 0" }}>
            <input
              type="text"
              placeholder="другой запрос…"
              style={{ maxWidth: 280 }}
              value={searchQ?.side === candidates.side ? searchQ.query : ""}
              onChange={(e) => setSearchQ({ side: candidates.side, query: e.target.value })}
            />
            <button
              className="secondary small"
              onClick={() => searchQ && search(searchQ.side, searchQ.query)}
            >
              Искать
            </button>
            <button className="secondary small" onClick={() => setCandidates(null)}>
              Закрыть
            </button>
          </div>
          <div className="cand-strip">
            {candidates.items.map((c, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={c.src}
                alt=""
                onClick={() => setImage(candidates.side, c.src, c.sourceUrl)}
              />
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="grid-4" style={{ marginTop: 10 }}>
          <label className="field">
            <span>Тиканье (сек)</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={q.tickSeconds}
              onChange={(e) => onChange({ ...q, tickSeconds: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Показывать %</span>
            <select
              value={q.showPercents ? "yes" : "no"}
              onChange={(e) => onChange({ ...q, showPercents: e.target.value === "yes" })}
            >
              <option value="yes">да</option>
              <option value="no">нет</option>
            </select>
          </label>
          <label className="field">
            <span>% за красное</span>
            <input
              type="number"
              min={1}
              max={99}
              value={q.percentA}
              onChange={(e) => onChange({ ...q, percentA: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Озвучка</span>
            <button
              className="secondary small"
              style={{ width: "100%" }}
              disabled={!!busy || !keys.elevenlabs}
              onClick={regenAudio}
            >
              {busy === "audio" ? <span className="spinner" /> : null}
              {q.audio ? "Переозвучить" : "Озвучить"}
            </button>
          </label>
        </div>
      )}

      {q.audio && (
        <audio controls src={q.audio.src} style={{ width: "100%", height: 32, marginTop: 8 }} />
      )}

      {err && <div className="error">{err}</div>}
    </div>
  );
}
