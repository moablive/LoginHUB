import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
    /** URI `otpauth://` devolvida por `/auth/2fa/setup`. */
    uri: string;
    tamanho?: number;
}

/**
 * Desenha o QR do enrolamento a partir da URI `otpauth://`.
 *
 * O desenho é feito AQUI, no navegador: o servidor devolve a URI e nunca uma
 * imagem. Trafegar PNG em base64 pela API só engordaria a resposta, e mandar o
 * QR por e-mail colocaria os dois fatores no mesmo canal — o mesmo e-mail
 * carrega o magic link de senha.
 *
 * `margin: 1` e não o padrão 4: a "quiet zone" cheia deixa o código minúsculo
 * dentro de um card estreito, e os leitores de autenticador toleram folga menor.
 */
export function QrCode({ uri, tamanho = 220 }: Props) {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [erro, setErro] = useState(false);

    useEffect(() => {
        let vivo = true;
        QRCode.toDataURL(uri, { width: tamanho, margin: 1, errorCorrectionLevel: 'M' })
            .then((url) => { if (vivo) setDataUrl(url); })
            .catch(() => { if (vivo) setErro(true); });
        return () => { vivo = false; };
    }, [uri, tamanho]);

    // Sem QR a pessoa não fica sem saída: o secret em texto continua na tela e
    // todo autenticador aceita digitação manual.
    if (erro) {
        return (
            <p className="text-sm text-muted-foreground">
                Não foi possível desenhar o QR. Use a chave abaixo para adicionar manualmente.
            </p>
        );
    }

    if (!dataUrl) {
        return <div style={{ width: tamanho, height: tamanho }} className="mx-auto animate-pulse rounded-lg bg-muted" />;
    }

    return (
        <img
            src={dataUrl}
            width={tamanho}
            height={tamanho}
            alt="QR code para o aplicativo autenticador"
            className="mx-auto rounded-lg bg-white p-2"
        />
    );
}
