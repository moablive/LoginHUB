<script setup lang="ts">
import { ref } from 'vue';
import { ArrowUpTrayIcon, PhotoIcon, TrashIcon } from '@heroicons/vue/24/outline';
import UiButton from '@/components/ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    /** Lado máximo da imagem após redimensionamento. */
    maxDimension?: number;
    /** Tamanho máximo do arquivo original em bytes. */
    maxFileSize?: number;
    rotulo?: string;
    dica?: string;
  }>(),
  {
    maxDimension: 256,
    maxFileSize: 2 * 1024 * 1024,
    rotulo: 'Logo do aplicativo',
    dica: 'PNG, JPG, WEBP ou SVG. Será redimensionado para 256px no maior lado.',
  },
);

/** Logo em dataURL base64, ou `null` sem logo. */
const modelo = defineModel<string | null>({ default: null });

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

const arquivo = ref<HTMLInputElement | null>(null);
const erro = ref<string | null>(null);
const processando = ref(false);

function lerComoDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function redimensionar(file: File, maxDimension: number): Promise<string> {
  // SVG é vetorial — não redimensiona, só lê como dataURL
  if (file.type === 'image/svg+xml') return lerComoDataUrl(file);

  const dataUrl = await lerComoDataUrl(file);
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxDimension / img.width, maxDimension / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      // PNG preserva transparência (importante para logos)
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Imagem inválida.'));
    img.src = dataUrl;
  });
}

function escolher() {
  erro.value = null;
  arquivo.value?.click();
}

async function aoEscolher(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // permite re-selecionar o mesmo arquivo
  if (!file) return;

  if (!ACCEPTED_TYPES.includes(file.type)) {
    erro.value = 'Formato inválido. Use PNG, JPG, WEBP ou SVG.';
    return;
  }
  if (file.size > props.maxFileSize) {
    erro.value = `Arquivo muito grande. Limite: ${Math.round(props.maxFileSize / 1024)} KB.`;
    return;
  }

  try {
    processando.value = true;
    modelo.value = await redimensionar(file, props.maxDimension);
  } catch (err) {
    console.error(err);
    erro.value = err instanceof Error ? err.message : 'Falha ao processar a imagem.';
  } finally {
    processando.value = false;
  }
}

function remover() {
  erro.value = null;
  modelo.value = null;
}
</script>

<template>
  <div>
    <p v-if="rotulo" class="mb-1.5 px-1 text-footnote font-medium text-label-2">{{ rotulo }}</p>

    <div class="flex items-center gap-4">
      <div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-fill-2 ring-1 ring-separator">
        <img v-if="modelo" :src="modelo" alt="Logo" class="h-full w-full object-contain p-1" />
        <PhotoIcon v-else class="h-8 w-8 text-label-3" />
      </div>

      <div class="flex min-w-0 flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <UiButton variante="tinted" tamanho="small" :carregando="processando" @click="escolher">
            <ArrowUpTrayIcon v-if="!processando" class="h-4 w-4" />
            {{ processando ? 'Processando…' : modelo ? 'Trocar imagem' : 'Selecionar imagem' }}
          </UiButton>
          <UiButton v-if="modelo" variante="destructive-tinted" tamanho="small" :disabled="processando" @click="remover">
            <TrashIcon class="h-4 w-4" />
            Remover
          </UiButton>
        </div>
        <p v-if="dica" class="text-footnote text-label-2">{{ dica }}</p>
      </div>
    </div>

    <p v-if="erro" role="alert" class="mt-2 px-1 text-footnote text-danger">{{ erro }}</p>

    <input ref="arquivo" type="file" :accept="ACCEPTED_TYPES.join(',')" class="hidden" @change="aoEscolher" />
  </div>
</template>
