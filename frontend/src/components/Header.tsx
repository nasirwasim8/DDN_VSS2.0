import { useEffect, useState } from 'react'
import { Moon, Sun, Cpu, Zap } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface Tab {
  id: string
  label: string
}

interface HeaderProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

interface HealthStatus {
  gpu_available: boolean
  device: string
}

export default function Header({ tabs, activeTab, onTabChange }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 10)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Fetch health status for GPU badge
  useEffect(() => {
    const healthUrl = import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/api/health`
      : '/api/health'

    const fetchHealth = async () => {
      try {
        const response = await fetch(healthUrl)
        if (response.ok) {
          const data = await response.json()
          setHealth({
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
    <header
      className={`nav-bar fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? 'scrolled' : ''
        }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Left: Logo + BUILD.DDN:VSS */}
          <div className="flex items-center">
            <img
              src="/logo-ddn.svg"
              alt="DDN"
              className="h-7 w-auto"
              style={{ filter: theme === 'dark' ? 'invert(1)' : 'none' }}
            />
            <div
              className="flex items-baseline ml-2 pl-2"
              style={{
                borderLeft: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
                height: '20px',
                alignSelf: 'center'
              }}
            >
              <span
                className="text-[13px] tracking-wide"
                style={{
                  fontWeight: 300,
                  color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                  letterSpacing: '0.05em'
                }}
              >
                BUILD.DDN:
              </span>
              <span
                className="text-[13px] tracking-wide"
                style={{
                  fontWeight: 700,
                  color: theme === 'dark' ? 'rgba(255,255,255,0.9)' : 'var(--ddn-red)',
                  letterSpacing: '0.05em'
                }}
              >
                VSS
              </span>
            </div>
          </div>

          {/* Center: Tabs */}
          <nav className="flex items-center gap-1">
            {tabs.map((tab) => {
              const isGtc = tab.id === 'gtc'
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-4 py-1.5 text-[13px] font-medium tracking-wide transition-all duration-200 rounded-full ${
                    isGtc
                      ? isActive
                        ? 'bg-[#ED2738] text-white shadow-sm'
                        : 'border border-[#ED2738]/40 text-[#ED2738] hover:bg-[#ED2738]/10'
                      : isActive
                        ? 'text-[var(--ddn-red)]'
                        : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {isGtc && <span className="mr-1 text-[10px]">✦</span>}
                  {tab.label}
                </button>
              )
            })}
          </nav>

          {/* Right: GPU Badge + Theme Toggle */}
          <div className="flex items-center gap-3">
            {/* GPU/CPU Badge */}
            {health && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${health.gpu_available
                  ? 'bg-nvidia-green/10 text-nvidia-green border border-nvidia-green/20'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700'
                  }`}
                title={`Running on ${health.device.toUpperCase()}`}
              >
                {health.gpu_available ? (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    GPU
                  </>
                ) : (
                  <>
                    <Cpu className="w-3.5 h-3.5" />
                    CPU
                  </>
                )}
              </div>
            )}

            {/* NVIDIA Powered By Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <span className="text-neutral-500 dark:text-neutral-400 font-normal">POWERED BY</span>
              <img
                src={theme === 'dark' ? '/nvidia-logo-light.png' : '/nvidia-logo-dark.png'}
                alt="NVIDIA"
                className="h-4"
              />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg nav-icon-button"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
