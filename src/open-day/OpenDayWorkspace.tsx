import { useEffect, useMemo, useRef, useState } from 'react';
import legacyDocument from './legacy/index.html?raw';
import legacyStyles from './legacy/styles.css?raw';
import legacyScript from './legacy/app.js?raw';

function createBodyMarkup() {
  const parsed = new DOMParser().parseFromString(legacyDocument, 'text/html');
  parsed.querySelectorAll('script').forEach((node) => node.remove());
  return parsed.body.innerHTML;
}

function createScopedStyles() {
  return [
    ':host { display: block; min-height: 100%; }',
    legacyStyles.replace('body {', '.open-day-body {'),
  ].join('\n');
}

interface OpenDayWorkspaceProps {
  activationKey: string;
}

export function OpenDayWorkspace({ activationKey }: OpenDayWorkspaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [bootError, setBootError] = useState('');
  const bodyMarkup = useMemo(() => createBodyMarkup(), []);
  const scopedStyles = useMemo(() => createScopedStyles(), []);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '';

    const styleElement = document.createElement('style');
    styleElement.textContent = scopedStyles;
    shadowRoot.appendChild(styleElement);

    const wrapper = document.createElement('div');
    wrapper.className = 'open-day-body';
    wrapper.innerHTML = bodyMarkup;
    shadowRoot.appendChild(wrapper);

    const downloadLink = shadowRoot.querySelector('.ghost-link');
    if (downloadLink instanceof HTMLAnchorElement) {
      downloadLink.href = '/open-day-sample-data.csv';
    }

    try {
      const runtime = new Function(
        'root',
        'hostWindow',
        'activationKey',
        `
          const document = root;
          const window = hostWindow;
          const fetch = (input, init = {}) => {
            const headers = new Headers(init.headers || {});
            const requestUrl = typeof input === 'string'
              ? input
              : input instanceof Request
                ? input.url
                : String(input);

            if (requestUrl.startsWith('/api/')) {
              headers.set('x-activation-key', activationKey);
            }

            return hostWindow.fetch(input, {
              ...init,
              headers,
            });
          };
          ${legacyScript}
        `,
      );
      runtime(shadowRoot, window, activationKey);
      setBootError('');
    } catch (error) {
      setBootError(error instanceof Error ? error.message : '开放日选址工作台加载失败。');
    }

    return () => {
      shadowRoot.innerHTML = '';
    };
  }, [activationKey, bodyMarkup, scopedStyles]);

  if (bootError) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-600">
        {bootError}
      </div>
    );
  }

  return <div ref={hostRef} className="block h-full overflow-auto rounded-[32px]" />;
}
