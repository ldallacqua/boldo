import type { BarcodeDetector } from 'barcode-detector/ponyfill';
import { eanFromScan } from '../../shared/catalog';

let detector: Promise<BarcodeDetector> | undefined;

/**
 * O leitor (ZXing em WebAssembly, 1 MB) só é baixado quando alguém abre a câmera. É o mesmo
 * em todo navegador: o `BarcodeDetector` nativo não existe no Safari nem no Chrome do Linux.
 */
function loadDetector(): Promise<BarcodeDetector> {
  if (!detector) {
    detector = (async () => {
      const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
        import('barcode-detector/ponyfill'),
        import('zxing-wasm/reader/zxing_reader.wasm?url'),
      ]);
      // Por padrão a biblioteca busca o .wasm em um CDN; aqui ele vem junto com o app.
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith('.wasm') ? wasmUrl : prefix + path,
        },
      });
      return new BarcodeDetector({ formats: ['ean_13', 'data_matrix'] });
    })();
    detector.catch(() => {
      detector = undefined;
    });
  }
  return detector;
}

/** Procura o código de um remédio em um quadro da câmera ou em uma foto. */
export async function readEan(source: ImageBitmapSource): Promise<string | null> {
  const found = await (await loadDetector()).detect(source);
  for (const code of found) {
    const ean = eanFromScan(code.rawValue);
    if (ean) return ean;
  }
  return null;
}
