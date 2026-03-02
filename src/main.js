import { createApp } from 'vue'
import App from './App.vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './styles.css'

const vuetify = createVuetify({
  components,
  directives,
  icons: { defaultSet: 'mdi' },
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#7c74cc',
          secondary: '#a8a6d8',
          background: '#16161e',
          surface: '#1e1e30',
          'on-surface': '#e0e0f4',
        },
      },
    },
  },
})

createApp(App).use(vuetify).mount('#app')
