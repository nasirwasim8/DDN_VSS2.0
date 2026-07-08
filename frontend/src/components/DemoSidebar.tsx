import { useEffect, useState } from 'react'
import { Settings, Upload, Search, FolderOpen, Zap, Cpu, Film, RefreshCw, Video, Radio } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface Tab {
  id: string
  label: string
  icon: string
}

interface DemoSidebarProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

interface HealthStatus {
  ddn_configured: boolean
  ai_models_loaded: boolean
  gpu_available: boolean
  device: string
}

const iconMap: Record<string, React.ReactNode> = {
  settings:    <Settings   className="w-5 h-5" />,
  upload:      <Upload     className="w-5 h-5" />,
  search:      <Search     className="w-5 h-5" />,
  folder:      <FolderOpen className="w-5 h-5" />,
  film:        <Film       className="w-5 h-5" />,
  'refresh-cw':<RefreshCw  className="w-5 h-5" />,
  video:       <Video      className="w-5 h-5" />,
  radio:       <Radio      className="w-5 h-5" />,
}

export default function DemoSidebar({ tabs, activeTab, onTabChange }: DemoSidebarProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const { theme } = useTheme()

  // Fetch health status for badges
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health')
        if (response.ok) {
          const data = await response.json()
          setHealth({
            ddn_configured: data.ddn_configured,
            ai_models_loaded: data.ai_models_loaded,
            gpu_available: data.gpu_available,
            device: data.device
          })
        }
      } catch (error) {
        console.error('Failed to fetch health status:', error)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return (
    <aside className="w-56 flex-shrink-0 hidden md:block">
      <div className="sticky top-[calc(var(--nav-height)+2rem)]">
        <nav className="space-y-1 px-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 group"
                style={{
                  background: isActive ? 'var(--surface-card)' : 'transparent',
                  border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none'
                }}
              >
                <span
                  className="transition-colors duration-200"
                  style={{ color: isActive ? 'var(--ddn-red)' : 'var(--text-muted)' }}
                >
                  {iconMap[tab.icon]}
                </span>
                <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-ddn-red" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Sidebar Footer - System Status */}
        <div
          className="mt-8 mx-4 border-t pt-4 space-y-3"
          style={{ borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-center gap-2">
            {/* GPU/CPU Icon Badge */}
            <div className={`p-1 rounded ${health?.gpu_available ? 'bg-nvidia-green/10' : 'bg-neutral-200 dark:bg-neutral-800'}`}>
              {health?.gpu_available ? (
                <Zap className="w-3 h-3 text-nvidia-green" />
              ) : (
                <Cpu className="w-3 h-3 text-neutral-500" />
              )}
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>System Status</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>DDN INFINIA</span>
              <span className={`text-sm px-2 py-0.5 rounded-full ${health?.ddn_configured ? 'text-nvidia-green bg-nvidia-green/10' : 'text-neutral-500 bg-neutral-200 dark:bg-neutral-800'
                }`}>
                {health?.ddn_configured ? 'Connected' : 'Not Configured'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>CLIP MODEL</span>
              <span className={`text-sm px-2 py-0.5 rounded-full ${health?.ai_models_loaded ? 'text-nvidia-green bg-nvidia-green/10' : 'text-neutral-500 bg-neutral-200 dark:bg-neutral-800'
                }`}>
                {health?.ai_models_loaded ? 'Ready' : 'Loading'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
