import { createContext, useContext } from 'react'

const STRINGS = {
  en: {
    'nav.home': 'Home',
    'nav.studio': 'Studio',
    'nav.help': 'Help',
    'nav.settings': 'Settings',
    'nav.about': 'About',
    'nav.privacy': 'Privacy',
    'home.title': 'Video, frame and GIF studio',
    'home.tagline': 'Edit a video, pull out perfect frames, enhance and upscale them, and turn them into GIFs. One workflow, all in your browser.',
    'home.private': 'Everything runs locally in your browser. Your videos, images and GIFs never leave your device.',
    'home.open': 'Open the studio',
    'studio.empty': 'Drop a video here, or choose a file to begin',
    'studio.choose': 'Choose video',
    'studio.sample': 'Try a sample clip',
    'studio.capture': 'Capture frame',
    'studio.batch': 'Batch capture',
    'studio.play': 'Play',
    'studio.pause': 'Pause',
    'gallery.title': 'Frames',
    'gallery.empty': 'No frames yet. Press S or the camera button to capture the current frame.',
    'export.title': 'Export animation',
    'tabs.video': 'Video',
    'tabs.frames': 'Frames',
    'tabs.export': 'Export',
  },
  es: {
    'nav.home': 'Inicio',
    'nav.studio': 'Estudio',
    'nav.help': 'Ayuda',
    'nav.settings': 'Ajustes',
    'nav.about': 'Acerca de',
    'nav.privacy': 'Privacidad',
    'home.title': 'Estudio de video, fotogramas y GIF',
    'home.tagline':
      'Edita un video, extrae fotogramas perfectos, mejóralos y amplíalos, y conviértelos en GIF. Un solo flujo de trabajo, todo en tu navegador.',
    'home.private': 'Todo se procesa localmente en tu navegador. Tus videos, imágenes y GIF nunca salen de tu dispositivo.',
    'home.open': 'Abrir el estudio',
    'studio.empty': 'Suelta un video aquí o elige un archivo para comenzar',
    'studio.choose': 'Elegir video',
    'studio.sample': 'Probar un clip de muestra',
    'studio.capture': 'Capturar fotograma',
    'studio.batch': 'Captura en lote',
    'studio.play': 'Reproducir',
    'studio.pause': 'Pausa',
    'gallery.title': 'Fotogramas',
    'gallery.empty': 'Aún no hay fotogramas. Pulsa S o el botón de cámara para capturar el fotograma actual.',
    'export.title': 'Exportar animación',
    'tabs.video': 'Video',
    'tabs.frames': 'Fotogramas',
    'tabs.export': 'Exportar',
  },
}

export const LANGS = [
  ['en', 'English'],
  ['es', 'Español'],
]

export const I18nContext = createContext('en')

export function translate(lang, key) {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
}

export function useT() {
  const lang = useContext(I18nContext)
  return (key) => translate(lang, key)
}
