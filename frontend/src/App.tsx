import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemeProvider } from './contexts/ThemeContext'
import Header from './components/Header'
import DemoSidebar from './components/DemoSidebar'
import ConfigurationPage from './pages/Configuration'
import MediaIntelligence from './pages/VideoUpload'
import SearchPage from './pages/Search'
import BrowsePage from './pages/Browse'
import VideoSearchPage from './pages/VideoSearch'
import ContinuousIngestionPage from './pages/ContinuousIngestion'
import AboutPage from './pages/About'
import GtcDeck from './pages/GtcDeck'


// Top-level navigation
const mainTabs = [
  { id: 'about', label: 'About' },
  { id: 'demo',  label: 'Demo' },
  { id: 'gtc',   label: 'GTC Deck' },
]

// Demo sidebar navigation
const demoTabs = [
  { id: 'config', label: 'Configuration', icon: 'settings' },
  { id: 'media-intelligence', label: 'Media Intelligence', icon: 'film' },
  { id: 'continuous-ingestion', label: 'Continuous Ingestion', icon: 'refresh-cw' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'video-search', label: 'Video Search', icon: 'video' },
  { id: 'browse', label: 'Library', icon: 'folder' },
]


function App() {
  const [mainView, setMainView] = useState<'about' | 'demo' | 'gtc'>('about')
  const [demoTab, setDemoTab] = useState('config')

  const handleStartDemo = () => {
    setMainView('demo')
    setDemoTab('config')
  }

  const handleMainTabChange = (tabId: string) => {
    if (tabId === 'about') setMainView('about')
    else if (tabId === 'gtc') setMainView('gtc')
    else setMainView('demo')
  }

  const renderDemoPage = () => {
    switch (demoTab) {
      case 'config':
        return <ConfigurationPage />
      case 'media-intelligence':
        return <MediaIntelligence />
      case 'continuous-ingestion':
        return <ContinuousIngestionPage />
      case 'search':
        return <SearchPage />
      case 'video-search':
        return <VideoSearchPage />
      case 'browse':
        return <BrowsePage />
      default:
        return <ConfigurationPage />
    }
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-[var(--surface-primary)] overflow-x-hidden transition-colors duration-200">
        <Header
          tabs={mainTabs}
          activeTab={mainView}
          onTabChange={handleMainTabChange}
        />

        {/* Main content */}
        <main>
          {mainView === 'gtc' ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="gtc"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <GtcDeck />
              </motion.div>
            </AnimatePresence>
          ) : mainView === 'about' ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="about"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="pt-[var(--nav-height)]"
              >
                <AboutPage onStartDemo={handleStartDemo} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex pt-[calc(var(--nav-height)+24px)] md:pt-[var(--nav-height)]">
              {/* Sidebar */}
              <DemoSidebar
                tabs={demoTabs}
                activeTab={demoTab}
                onTabChange={setDemoTab}
              />

              {/* Demo Content */}
              <div className="flex-1 min-w-0">
                <div className="max-w-[1100px] mx-auto px-6 py-8">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="card"
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={demoTab}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="p-6 md:p-8"
                      >
                        {renderDemoPage()}
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>

                  {/* Footer */}
                  <footer className="text-center mt-8">
                    <p className="text-[13px] text-text-muted">
                      DDN INFINIA Multimodal Semantic Search Demo
                    </p>
                    <p className="text-[12px] text-text-muted mt-1">
                      FastAPI + React + NVIDIA CLIP/BLIP
                      <span className="ml-2 px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-xs font-medium">
                        v2.1.1
                      </span>
                    </p>
                  </footer>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  )
}

export default App
