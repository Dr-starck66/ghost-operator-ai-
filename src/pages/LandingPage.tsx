import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Terminal, Database, ShieldAlert, Cpu, ArrowRight, Activity, Code2, Globe2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-900 font-bold tracking-tight text-lg">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            GHOST OP
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Pricing</a>
            <Link to="/dashboard" className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition-colors shadow-sm">
              Go to App
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-24 px-6 relative">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-100 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center mt-12 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 text-[10px] font-mono text-gray-500 mb-8 uppercase font-bold tracking-wider shadow-sm"
          >
            <Activity className="w-3 h-3 text-blue-600 status-pulse" />
            <span>v2.4.0 Self-Healing Engine Live</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tighter text-gray-900 mb-6 leading-[1.1]"
          >
            The digital employee that<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
              never sleeps.
            </span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-gray-500 font-light mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            Extract data, automate workflows, and monitor competitors with an autonomous AI agent. It visualizes DOM changes, writes its own selectors, and heals itself.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/dashboard/build" className="h-10 bg-blue-600 text-white px-6 rounded font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
              Deploy Your First Agent <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#how-it-works" className="h-10 bg-white border border-gray-200 text-gray-600 px-6 rounded font-semibold hover:text-gray-900 hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm">
              View API Docs <Code2 className="w-4 h-4 text-gray-400" />
            </a>
          </motion.div>
        </div>

        {/* Feature Grid */}
        <div className="max-w-6xl mx-auto mt-40 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          <FeatureCard 
            icon={<Cpu className="w-5 h-5 text-blue-600" />}
            title="Agentic Thinking Loop"
            description="Observe, Think, Decide, Execute. Overcomes captchas and dynamically loaded SPA content via multi-step planning."
          />
          <FeatureCard 
            icon={<ShieldAlert className="w-5 h-5 text-blue-600" />}
            title="Self-Healing Selectors"
            description="When a site updates, we don't break. Ghost utilizes visual heuristics and DOM diffing to self-repair broken selectors."
          />
          <FeatureCard 
            icon={<Database className="w-5 h-5 text-blue-600" />}
            title="Structured Output"
            description="Force the output schema you need. Get clean, typed JSON sent directly to your database via webhook or REST API."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 rounded-xl bg-white border border-gray-200 shadow-sm hover:border-blue-200 hover:shadow-md transition-all">
      <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
