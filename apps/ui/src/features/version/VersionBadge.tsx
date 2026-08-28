/**
 * `v1.0.0` discreto no canto — responde metade das duvidas de suporte antes de
 * virarem chamado ("qual versao voce esta vendo?").
 *
 * Canto inferior ESQUERDO de proposito: o direito e do ThemeToggle.
 */
export function VersionBadge() {
  const version = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const buildDate = import.meta.env.VITE_APP_BUILD_DATE || '';

  const title = (() => {
    if (!buildDate) return `LoginHUB v${version}`;
    const d = new Date(buildDate);
    const stamp = Number.isNaN(d.getTime())
      ? buildDate
      : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return `LoginHUB v${version} — build de ${stamp}`;
  })();

  return (
    <span
      className="fixed bottom-2 left-2 z-[9999] select-none rounded-md border border-border
                 bg-card px-2 py-0.5 font-mono text-[11px] leading-none
                 text-muted-foreground"
      title={title}
    >
      v{version}
    </span>
  );
}
