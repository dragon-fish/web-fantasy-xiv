import { render } from 'preact'
import 'virtual:uno.css'
import './ui/global.css'
import { App } from './ui/App'

render(<App />, document.getElementById('app')!)
