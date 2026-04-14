import { EngineProvider } from './engine-context'

export function App() {
  return (
    <EngineProvider>
      <div
        id="ui-overlay"
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none', fontFamily: "'Segoe UI', sans-serif", color: '#fff',
        }}
      />
    </EngineProvider>
  )
}
