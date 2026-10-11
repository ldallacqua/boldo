import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { normalizeEan, type CatalogMatch } from '../../shared/catalog';
import { findInCatalog } from '../lib/catalog';
import { readEan } from '../lib/scanner';
import { Icon } from './Icon';

type Camera = 'starting' | 'on' | 'off';

interface BarcodeScannerProps {
  onMatch: (match: CatalogMatch) => void;
  onClose: () => void;
}

const SCAN_INTERVAL_MS = 250;

/**
 * Lê o código de barras da caixa pela câmera (ou por uma foto, ou digitado) e procura o
 * remédio na lista da Anvisa.
 */
export function BarcodeScanner({ onMatch, onClose }: BarcodeScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<Camera>('starting');
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'aviso' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  // O último código procurado: a câmera continua vendo a mesma caixa e não deve repetir a busca.
  const lastCode = useRef<string | null>(null);
  const onMatchRef = useRef(onMatch);
  useEffect(() => {
    onMatchRef.current = onMatch;
  });

  const lookUp = async (ean: string) => {
    lastCode.current = ean;
    setBusy(true);
    setMessage({ text: `Procurando o código ${ean}…`, tone: 'info' });
    try {
      const match = await findInCatalog(ean);
      if (match) return onMatchRef.current(match);
      setMessage({
        text: `O código ${ean} não está na lista da Anvisa. Preencha os dados à mão.`,
        tone: 'aviso',
      });
    } catch {
      lastCode.current = null;
      setMessage({
        text: 'Não deu para consultar a lista de remédios. Confira a internet e tente de novo.',
        tone: 'aviso',
      });
    } finally {
      setBusy(false);
    }
  };
  const lookUpRef = useRef(lookUp);
  useEffect(() => {
    lookUpRef.current = lookUp;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scan = async () => {
      const element = video.current;
      if (stopped || !element) return;
      if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        // Um quadro ilegível é normal (foco, reflexo): o próximo tenta de novo.
        const ean = await readEan(element).catch(() => null);
        if (!stopped && ean && ean !== lastCode.current) await lookUpRef.current(ean);
      }
      if (!stopped) timer = setTimeout(scan, SCAN_INTERVAL_MS);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        });
      } catch {
        // Sem câmera, sem permissão ou sem HTTPS: sobram a foto e os números digitados.
        if (!stopped) setCamera('off');
        return;
      }
      const element = video.current;
      if (stopped || !element) return stream.getTracks().forEach((track) => track.stop());
      element.srcObject = stream;
      await element.play().catch(() => undefined);
      if (stopped) return;
      setCamera('on');
      void scan();
    };
    void start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage({ text: 'Lendo a foto…', tone: 'info' });
    const ean = await createImageBitmap(file)
      .then(readEan)
      .catch(() => null);
    setBusy(false);
    if (ean) return lookUp(ean);
    setMessage({
      text: 'Não achei um código de barras na foto. Tente mais de perto, com boa luz e sem reflexo.',
      tone: 'aviso',
    });
  };

  const onTyped = () => {
    const ean = normalizeEan(typed);
    if (ean) return void lookUp(ean);
    setMessage({
      text: 'Confira os números: o código de barras da caixa tem 13 dígitos.',
      tone: 'aviso',
    });
  };

  return (
    <section className="leitor" aria-label="Leitor de código de barras">
      {camera !== 'off' && (
        <div className="leitor-camera" data-ligada={camera === 'on'}>
          <video ref={video} muted playsInline aria-label="Imagem da câmera" />
          <span className="leitor-mira" aria-hidden="true" />
        </div>
      )}

      <p className="leitor-estado" data-tone={message?.tone ?? 'info'} role="status">
        {message?.text ??
          (camera === 'on'
            ? 'Aponte a câmera para o código de barras da caixa.'
            : camera === 'starting'
              ? 'Abrindo a câmera…'
              : 'A câmera não abriu neste aparelho. Tire uma foto do código ou digite os números.')}
      </p>

      {camera === 'off' && (
        <label className="botao leitor-foto" data-variant="secundario">
          <Icon name="scan" size={20} />
          Tirar foto do código
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="so-leitor"
            onChange={onPhoto}
            disabled={busy}
          />
        </label>
      )}

      <div className="campo">
        <label htmlFor="codigo-barras">Ou digite os números do código de barras</label>
        <div className="campo-sufixo">
          <input
            id="codigo-barras"
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // Enter busca o código em vez de enviar o formulário do remédio.
              e.preventDefault();
              onTyped();
            }}
            placeholder="7891234567895"
          />
          <button
            type="button"
            className="botao"
            data-variant="secundario"
            onClick={onTyped}
            disabled={busy}
          >
            Buscar
          </button>
        </div>
      </div>

      <button type="button" className="link leitor-fechar" onClick={onClose}>
        Fechar leitor
      </button>
    </section>
  );
}
