"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiKeys, Project, Question, DEFAULT_TICK_SECONDS } from "@/lib/types";
import { api, loadKeys, persistKeys } from "@/lib/client";
import QuestionCard from "@/components/QuestionCard";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProjectState] = useState<Project | null>(null);
  const [keys, setKeys] = useState<ApiKeys>({});
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- bootstrapping ----
  useEffect(() => {
    const k = loadKeys();
    setKeys(k.keys);
    setRemember(k.remembered);
    api<{ projects: Project[] }>("/api/project").then((r) => {
      setProjects(r.projects);
      if (r.projects[0]) setProjectState(r.projects[0]);
    });
  }, []);

  useEffect(() => {
    persistKeys(keys, remember);
  }, [keys, remember]);

  // ---- project updates (debounced autosave for local edits) ----
  const setProject = useCallback((p: Project, save = true) => {
    setProjectState(p);
    setProjects((list) => list.map((x) => (x.id === p.id ? p : x)));
    if (save) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api("/api/project", { action: "update", project: p }).catch(() => {});
      }, 600);
    }
  }, []);

  /** Project came back from the server — no need to re-save. */
  const setFromServer = useCallback((p: Project) => {
    setProjectState(p);
    setProjects((list) => list.map((x) => (x.id === p.id ? p : x)));
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setErr(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // ---- actions ----
  const createProject = () =>
    run("create", async () => {
      const r = await api("/api/project", { action: "create" });
      setProjects((l) => [r.project, ...l]);
      setProjectState(r.project);
    });

  const removeProject = (id: string) =>
    run("delete", async () => {
      if (!confirm("Удалить проект и все его файлы?")) return;
      await api("/api/project", { action: "delete", id });
      setProjects((l) => l.filter((p) => p.id !== id));
      if (project?.id === id) setProjectState(null);
    });

  const generateScript = (mode: "replace" | "append") =>
    run("script", async () => {
      if (!project) return;
      const r = await api("/api/script", {
        projectId: project.id,
        apiKey: keys.deepseek,
        topic: project.settings.topic,
        count: project.settings.questionCount,
        mode,
      });
      setFromServer(r.project);
      setNotice("Сценарий готов — отредактируй вопросы ниже, если нужно.");
    });

  const autoImages = () =>
    run("images", async () => {
      if (!project) return;
      const r = await api<{ project: Project; errors: string[] }>("/api/images", {
        projectId: project.id,
        action: "auto",
        provider: project.settings.imageProvider,
        keys,
      });
      setFromServer(r.project);
      setNotice(
        r.errors.length
          ? `Картинки подобраны, но с ошибками:\n${r.errors.join("\n")}`
          : "Все картинки подобраны. Кликни по миниатюре, чтобы заменить."
      );
    });

  const generateTts = () =>
    run("tts", async () => {
      if (!project) return;
      const r = await api<{ project: Project; generated: number; errors: string[] }>(
        "/api/tts",
        { projectId: project.id, apiKey: keys.elevenlabs }
      );
      setFromServer(r.project);
      setNotice(
        `Озвучено вопросов: ${r.generated}.` +
          (r.errors.length ? `\nОшибки:\n${r.errors.join("\n")}` : "")
      );
    });

  const buildComposition = () =>
    run("comp", async () => {
      if (!project) return;
      const r = await api("/api/composition", { projectId: project.id });
      setFromServer(r.project);
      setPreviewNonce((n) => n + 1);
      setNotice("Композиция собрана — смотри превью ниже.");
    });

  const startRender = () =>
    run("render", async () => {
      if (!project) return;
      const r = await api("/api/render", {
        projectId: project.id,
        apiKey: keys.heygen,
      });
      setFromServer(r.project);
    });

  const pollRender = () =>
    run("poll", async () => {
      if (!project) return;
      const res = await fetch(`/api/render?projectId=${project.id}`, {
        headers: { "x-heygen-key": keys.heygen ?? "" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFromServer(data.project);
    });

  const updateQuestion = (idx: number, q: Question) => {
    if (!project) return;
    const questions = [...project.questions];
    questions[idx] = q;
    setProject({ ...project, questions, composition: undefined });
  };

  const addQuestion = () => {
    if (!project) return;
    const q: Question = {
      id: `q-${Date.now()}-m`,
      optionA: { text: "", imageQuery: "" },
      optionB: { text: "", imageQuery: "" },
      voiceText: " или ?",
      kind: "normal",
      showPercents: true,
      percentA: 50,
      tickSeconds: DEFAULT_TICK_SECONDS,
    };
    setProject({ ...project, questions: [...project.questions, q], composition: undefined });
  };

  const ready = {
    script: (project?.questions.length ?? 0) > 0,
    images:
      !!project?.questions.length &&
      project.questions.every((q) => q.optionA.image?.src && q.optionB.image?.src),
    audio:
      !!project?.questions.length && project.questions.every((q) => q.audio),
    composition: !!project?.composition,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="red">ИЛИ</span> <span className="blue">Studio</span>
        </div>
        <div className="muted">Генератор видео «Что выберешь?»</div>
        <button onClick={createProject} disabled={busy === "create"}>
          + Новый проект
        </button>
        <div style={{ overflowY: "auto" }}>
          {projects.map((p) => (
            <div
              key={p.id}
              className={`proj-item ${project?.id === p.id ? "active" : ""}`}
              onClick={() => setProjectState(p)}
            >
              <div>{p.title}</div>
              <div className="muted">
                {p.questions.length} вопр. ·{" "}
                {new Date(p.updatedAt).toLocaleDateString("ru-RU")}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        {/* ---- API keys ---- */}
        <section className="panel">
          <h2><span className="step-num">🔑</span> API-ключи</h2>
          <div className="grid-4">
            <label className="field">
              <span>DeepSeek (сценарий)</span>
              <input type="password" value={keys.deepseek ?? ""} placeholder="sk-…"
                onChange={(e) => setKeys({ ...keys, deepseek: e.target.value })} />
            </label>
            <label className="field">
              <span>ElevenLabs (озвучка)</span>
              <input type="password" value={keys.elevenlabs ?? ""}
                onChange={(e) => setKeys({ ...keys, elevenlabs: e.target.value })} />
            </label>
            <label className="field">
              <span>HeyGen (рендер)</span>
              <input type="password" value={keys.heygen ?? ""}
                onChange={(e) => setKeys({ ...keys, heygen: e.target.value })} />
            </label>
            <label className="field">
              <span>Pexels (фото, опц.)</span>
              <input type="password" value={keys.pexels ?? ""}
                onChange={(e) => setKeys({ ...keys, pexels: e.target.value })} />
            </label>
          </div>
          <label className="row muted" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={remember}
              onChange={(e) => setRemember(e.target.checked)} />
            запомнить ключи в этом браузере
          </label>
        </section>

        {!project ? (
          <section className="panel">
            <h2>Создай первый проект</h2>
            <p className="muted">Нажми «+ Новый проект» слева, и поехали.</p>
          </section>
        ) : (
          <>
            {err && <div className="error">{err}</div>}
            {notice && <div className="ok">{notice}</div>}

            {/* ---- Step 1: settings + script ---- */}
            <section className="panel">
              <h2><span className="step-num">1</span> Сценарий</h2>
              <div className="grid-4">
                <label className="field" style={{ gridColumn: "span 2" }}>
                  <span>Название проекта</span>
                  <input type="text" value={project.title}
                    onChange={(e) => setProject({ ...project, title: e.target.value })} />
                </label>
                <label className="field">
                  <span>Кол-во вопросов</span>
                  <input type="number" min={1} max={20}
                    value={project.settings.questionCount}
                    onChange={(e) => setProject({
                      ...project,
                      settings: { ...project.settings, questionCount: Number(e.target.value) },
                    })} />
                </label>
                <label className="field">
                  <span>TikTok-ник (водяной знак)</span>
                  <input type="text" placeholder="@nickname"
                    value={project.settings.handle}
                    onChange={(e) => setProject({
                      ...project,
                      settings: { ...project.settings, handle: e.target.value },
                    })} />
                </label>
              </div>
              <label className="field">
                <span>Тематика / пожелания для сценария</span>
                <textarea value={project.settings.topic}
                  onChange={(e) => setProject({
                    ...project,
                    settings: { ...project.settings, topic: e.target.value },
                  })} />
              </label>
              <div className="row">
                <button disabled={!!busy || !keys.deepseek} onClick={() => generateScript("replace")}>
                  {busy === "script" ? <span className="spinner" /> : null}
                  Сгенерировать сценарий
                </button>
                {ready.script && (
                  <button className="secondary" disabled={!!busy || !keys.deepseek}
                    onClick={() => generateScript("append")}>
                    + Догенерировать ещё
                  </button>
                )}
                <button className="secondary" onClick={addQuestion}>
                  + Вопрос вручную
                </button>
                {!keys.deepseek && <span className="muted">нужен DeepSeek ключ</span>}
              </div>
            </section>

            {/* ---- Step 2: questions editor ---- */}
            {ready.script && (
              <section className="panel">
                <h2><span className="step-num">2</span> Вопросы, картинки и озвучка</h2>
                <div className="row" style={{ marginBottom: 14 }}>
                  <label className="field" style={{ margin: 0, width: 220 }}>
                    <span>Источник картинок</span>
                    <select value={project.settings.imageProvider}
                      onChange={(e) => setProject({
                        ...project,
                        settings: { ...project.settings, imageProvider: e.target.value as Project["settings"]["imageProvider"] },
                      })}>
                      <option value="pexels">Pexels (нужен ключ)</option>
                      <option value="openverse">Openverse (без ключа)</option>
                    </select>
                  </label>
                  <button disabled={!!busy} onClick={autoImages}>
                    {busy === "images" ? <span className="spinner" /> : null}
                    Подобрать все картинки
                  </button>
                  <button disabled={!!busy || !keys.elevenlabs} onClick={generateTts}>
                    {busy === "tts" ? <span className="spinner" /> : null}
                    Озвучить всё (Adam)
                  </button>
                  {!keys.elevenlabs && <span className="muted">нужен ElevenLabs ключ</span>}
                </div>

                {project.questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    project={project}
                    question={q}
                    index={i}
                    keys={keys}
                    onProject={setFromServer}
                    onChange={(nq) => updateQuestion(i, nq)}
                    onDelete={() => setProject({
                      ...project,
                      questions: project.questions.filter((x) => x.id !== q.id),
                      composition: undefined,
                    })}
                    onMove={(dir) => {
                      const j = i + dir;
                      if (j < 0 || j >= project.questions.length) return;
                      const qs = [...project.questions];
                      [qs[i], qs[j]] = [qs[j], qs[i]];
                      setProject({ ...project, questions: qs, composition: undefined });
                    }}
                  />
                ))}
              </section>
            )}

            {/* ---- Step 3: build + preview ---- */}
            {ready.script && (
              <section className="panel">
                <h2><span className="step-num">3</span> Сборка и превью</h2>
                {!ready.audio && (
                  <p className="muted">⚠️ Не все вопросы озвучены — тайминги будут приблизительными.</p>
                )}
                {!ready.images && (
                  <p className="muted">⚠️ Не у всех вариантов есть картинки — будут текстовые заглушки.</p>
                )}
                <div className="row">
                  <button disabled={!!busy} onClick={buildComposition}>
                    {busy === "comp" ? <span className="spinner" /> : null}
                    Собрать композицию
                  </button>
                  {ready.composition && (
                    <>
                      <a href={`/api/composition?projectId=${project.id}`}>
                        <button className="secondary">⬇ Скачать Hyperframes ZIP</button>
                      </a>
                      <span className="muted">
                        длительность ~{project.composition!.totalDuration.toFixed(1)}с
                      </span>
                    </>
                  )}
                </div>
                {ready.composition && (
                  <iframe
                    key={previewNonce}
                    className="preview-frame"
                    style={{ marginTop: 14 }}
                    src={`${project.composition!.dir}/index.html?preview=1&n=${previewNonce}`}
                  />
                )}
              </section>
            )}

            {/* ---- Step 4: render ---- */}
            {ready.composition && (
              <section className="panel">
                <h2><span className="step-num">4</span> Рендер в MP4 (HeyGen)</h2>
                <div className="row">
                  <button className="success" disabled={!!busy || !keys.heygen} onClick={startRender}>
                    {busy === "render" ? <span className="spinner" /> : null}
                    🎬 Запустить рендер
                  </button>
                  {project.render && (
                    <button className="secondary" disabled={!!busy} onClick={pollRender}>
                      {busy === "poll" ? <span className="spinner" /> : null}
                      Обновить статус
                    </button>
                  )}
                  {!keys.heygen && <span className="muted">нужен HeyGen ключ</span>}
                </div>
                {project.render && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted">
                      Статус: <strong>{project.render.status}</strong>
                      {project.render.failureMessage && ` — ${project.render.failureMessage}`}
                    </div>
                    {project.render.videoUrl && (
                      <div className="ok">
                        ✅ Готово!{" "}
                        <a href={project.render.videoUrl} target="_blank" rel="noreferrer">
                          Скачать видео
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <p className="muted" style={{ marginTop: 10 }}>
                  Либо рендери локально: скачай ZIP, распакуй и запусти{" "}
                  <code>npx hyperframes render</code> (нужны Node 22+, Chrome и ffmpeg).
                </p>
              </section>
            )}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="danger small" onClick={() => removeProject(project.id)}>
                Удалить проект
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
