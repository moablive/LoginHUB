import { useRef, useState } from "react";
import { PhotoIcon, TrashIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";

interface LogoUploadProps {
  value?: string | null;
  onChange: (base64: string | null) => void;
  /** Lado máximo da imagem após redimensionamento. Default 256px. */
  maxDimension?: number;
  /** Tamanho máximo do arquivo original em bytes. Default 2MB. */
  maxFileSize?: number;
  label?: string;
  helperText?: string;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

async function resizeImageToBase64(file: File, maxDimension: number): Promise<string> {
  // SVG é vetorial — não redimensiona, só lê como dataURL
  if (file.type === "image/svg+xml") {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxDimension / img.width, maxDimension / img.height, 1);
      const targetW = Math.round(img.width * ratio);
      const targetH = Math.round(img.height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      // PNG preserva transparência (importante para logos)
      const out = canvas.toDataURL("image/png");
      resolve(out);
    };
    img.onerror = () => reject(new Error("Imagem inválida."));
    img.src = dataUrl;
  });
}

export const LogoUpload = ({
  value,
  onChange,
  maxDimension = 256,
  maxFileSize = 2 * 1024 * 1024,
  label = "Logo do Aplicativo",
  helperText = "PNG, JPG, WEBP ou SVG. Será redimensionado para 256px no maior lado.",
}: LogoUploadProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePick = () => {
    setError(null);
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato inválido. Use PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > maxFileSize) {
      setError(`Arquivo muito grande. Limite: ${Math.round(maxFileSize / 1024)} KB.`);
      return;
    }

    try {
      setIsProcessing(true);
      const base64 = await resizeImageToBase64(file, maxDimension);
      onChange(base64);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao processar a imagem.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = () => {
    setError(null);
    onChange(null);
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}

      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 h-20 w-20 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt="Logo" className="h-full w-full object-contain p-1" />
          ) : (
            <PhotoIcon className="h-8 w-8 text-gray-300" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePick}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors disabled:opacity-50"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {isProcessing ? "Processando..." : value ? "Trocar imagem" : "Selecionar imagem"}
            </button>
            {value && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isProcessing}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-100 transition-colors disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
                Remover
              </button>
            )}
          </div>
          {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
};
