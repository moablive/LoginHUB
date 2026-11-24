import type { Component } from 'vue';
import {
  AcademicCapIcon,
  BanknotesIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CloudIcon,
  CodeBracketIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FaceSmileIcon,
  FireIcon,
  GlobeAltIcon,
  HeartIcon,
  HomeIcon,
  KeyIcon,
  MusicalNoteIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  StarIcon,
  UserGroupIcon,
  WalletIcon,
  WifiIcon,
} from '@heroicons/vue/24/outline';

/**
 * Ícone e cor de cada cofre (20/11/2026, pedido do dono: cofres como os do
 * Proton Pass). Os dois vão como IDENTIFICADOR dentro dos dados cifrados do
 * cofre, ao lado do nome; o servidor não fica sabendo. Identificador que não
 * está nas tabelas (cofre antigo, dado mexido) cai no padrão.
 */
export interface AparenciaCofre {
  icone: string;
  cor: string;
}

export const APARENCIA_PADRAO: AparenciaCofre = { icone: 'carteira', cor: 'roxo' };

export const ICONES_DO_COFRE: { id: string; nome: string; icone: Component }[] = [
  { id: 'carteira', nome: 'Carteira', icone: WalletIcon },
  { id: 'casa', nome: 'Casa', icone: HomeIcon },
  { id: 'trabalho', nome: 'Trabalho', icone: BriefcaseIcon },
  { id: 'empresa', nome: 'Empresa', icone: BuildingOffice2Icon },
  { id: 'pessoas', nome: 'Pessoas', icone: UserGroupIcon },
  { id: 'rosto', nome: 'Pessoal', icone: FaceSmileIcon },
  { id: 'computador', nome: 'Computador', icone: ComputerDesktopIcon },
  { id: 'celular', nome: 'Celular', icone: DevicePhoneMobileIcon },
  { id: 'servidor', nome: 'Servidor', icone: ServerStackIcon },
  { id: 'terminal', nome: 'Terminal', icone: CommandLineIcon },
  { id: 'codigo', nome: 'Código', icone: CodeBracketIcon },
  { id: 'nuvem', nome: 'Nuvem', icone: CloudIcon },
  { id: 'rede', nome: 'Rede', icone: WifiIcon },
  { id: 'web', nome: 'Sites', icone: GlobeAltIcon },
  { id: 'email', nome: 'E-mail', icone: EnvelopeIcon },
  { id: 'documento', nome: 'Documentos', icone: DocumentTextIcon },
  { id: 'banco', nome: 'Banco', icone: BanknotesIcon },
  { id: 'cartao', nome: 'Cartões', icone: CreditCardIcon },
  { id: 'compras', nome: 'Compras', icone: ShoppingCartIcon },
  { id: 'musica', nome: 'Música', icone: MusicalNoteIcon },
  { id: 'estudo', nome: 'Estudo', icone: AcademicCapIcon },
  { id: 'chave', nome: 'Chaves', icone: KeyIcon },
  { id: 'escudo', nome: 'Segurança', icone: ShieldCheckIcon },
  { id: 'fogo', nome: 'Fogo', icone: FireIcon },
  { id: 'coracao', nome: 'Coração', icone: HeartIcon },
  { id: 'estrela', nome: 'Estrela', icone: StarIcon },
];

// Tons médios: leem bem sobre o fundo claro e sobre o escuro.
export const CORES_DO_COFRE: { id: string; nome: string; hex: string }[] = [
  { id: 'roxo', nome: 'Roxo', hex: '#8B5CF6' },
  { id: 'azul', nome: 'Azul', hex: '#3B82F6' },
  { id: 'ciano', nome: 'Ciano', hex: '#06B6D4' },
  { id: 'verde', nome: 'Verde', hex: '#22C55E' },
  { id: 'lima', nome: 'Lima', hex: '#65A30D' },
  { id: 'ambar', nome: 'Âmbar', hex: '#D97706' },
  { id: 'laranja', nome: 'Laranja', hex: '#F97316' },
  { id: 'vermelho', nome: 'Vermelho', hex: '#EF4444' },
  { id: 'rosa', nome: 'Rosa', hex: '#EC4899' },
  { id: 'cinza', nome: 'Cinza', hex: '#8E8E93' },
];

const ICONE_PADRAO: Component = WalletIcon;
const COR_PADRAO = '#8B5CF6';

export const iconeDoCofre = (id?: string): Component => ICONES_DO_COFRE.find((i) => i.id === id)?.icone ?? ICONE_PADRAO;

export const corDoCofre = (id?: string): string => CORES_DO_COFRE.find((c) => c.id === id)?.hex ?? COR_PADRAO;

/** Fundo da cor a 15% com o ícone na cor cheia (o "tinted" dos controles). */
export const estiloDoCofre = (cor?: string): { backgroundColor: string; color: string } => {
  const hex = corDoCofre(cor);
  return { backgroundColor: `${hex}26`, color: hex };
};

// ------------------------------------------------------------ imagem do cofre (24/11/2026)

/**
 * O dono pode pôr uma IMAGEM no lugar do ícone. Ela vira uma miniatura quadrada
 * aqui no navegador e vai, como data: URL, dentro dos dados cifrados do cofre —
 * o servidor não a vê. O teto mantém o registro do cofre bem abaixo do limite
 * do hub (64 KB por registro).
 */
const LADO_DA_IMAGEM = 128;
const MAX_IMAGEM = 28 * 1024;
const DATA_DE_IMAGEM = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Só data: de imagem, no tamanho que este arquivo gera. Qualquer outra coisa (dado mexido) é ignorada. */
export const imagemDoCofreValida = (s: unknown): s is string => typeof s === 'string' && s.length <= MAX_IMAGEM && DATA_DE_IMAGEM.test(s);

/**
 * Reduz o arquivo escolhido a uma miniatura quadrada (corte central). Lança
 * `IMAGEM_INVALIDA` se o navegador não conseguir abrir o arquivo como imagem.
 */
export async function miniaturaDoCofre(arquivo: Blob): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error('IMAGEM_INVALIDA');
  }
  const lado = Math.min(bitmap.width, bitmap.height);
  const tela = document.createElement('canvas');
  tela.width = LADO_DA_IMAGEM;
  tela.height = LADO_DA_IMAGEM;
  const ctx = tela.getContext('2d');
  if (!ctx || lado === 0) throw new Error('IMAGEM_INVALIDA');
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO_DA_IMAGEM, LADO_DA_IMAGEM);
  bitmap.close();
  // WebP onde o navegador gera (menor e com transparência); senão JPEG, baixando a qualidade até caber.
  for (const [tipo, qualidade] of [['image/webp', 0.85], ['image/webp', 0.6], ['image/jpeg', 0.8], ['image/jpeg', 0.55]] as const) {
    const url = tela.toDataURL(tipo, qualidade);
    if (url.startsWith(`data:${tipo}`) && imagemDoCofreValida(url)) return url;
  }
  throw new Error('IMAGEM_INVALIDA');
}
