import { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import {
    FolderSync, ChevronRight, Cpu, Terminal, Shield, Zap, Sparkles,
    Key, CheckCircle, Loader2, Sun, Moon, Bell, BellOff, GitCommitHorizontal,
    RotateCcw, Play, Pause, FastForward, Info, Database, Download,
    RefreshCw, Scale, Link, Braces,
} from 'lucide-react'
import { AVAILABLE_MODELS } from '@shared/pricing'
import { tierColors } from '@/shared/constants/statusMaps'
import { getStoredTheme, applyTheme } from '@/lib/theme'
import { useIpcListener } from '@/shared/hooks/useIpcListener'
import type { EngineMode, CliToolsPreset, BuildMode, SessionMode } from '@shared/types'

type Theme = 'light' | 'dark' | 'system'

interface SettingsViewProps {
    onSwitchProject: () => void
}

interface SettingsRowProps {
    icon: React.ReactNode
    label: string
    description?: string
    tooltip?: string
    onClick?: () => void
    children?: React.ReactNode
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
    const [show, setShow] = useState(false)
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
    const triggerRef = useRef<HTMLDivElement>(null)

    const handleEnter = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setCoords({
                top: rect.top - 8,
                left: rect.left + rect.width / 2,
            })
        }
        setShow(true)
    }

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={handleEnter}
            onMouseLeave={() => setShow(false)}
            ref={triggerRef}
        >
            {children}
            {show && coords && ReactDOM.createPortal(
                <div
                    style={{ top: coords.top, left: coords.left }}
                    className="fixed -translate-x-1/2 -translate-y-full px-3 py-2 rounded-md bg-foreground text-background text-xs w-64 text-center whitespace-normal z-[9999] pointer-events-none shadow-xl"
                >
                    {text}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-foreground" />
                </div>,
                document.body,
            )}
        </div>
    )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">{title}</h3>
            <div className="rounded-lg bg-card overflow-hidden divide-y divide-border">
                {children}
            </div>
        </div>
    )
}

function SettingsRow({ icon, label, description, tooltip, onClick, children }: SettingsRowProps) {
    const isClickable = !!onClick
    const Tag = isClickable ? 'button' : 'div'

    return (
        <Tag
            onClick={onClick}
            className={`flex items-center gap-3 w-full px-4 py-3 text-left ${
                isClickable ? 'hover:bg-accent/50 transition-colors cursor-pointer' : ''
            }`}
        >
            <div className="shrink-0 text-muted-foreground">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{label}</p>
                    {tooltip && (
                        <Tooltip text={tooltip}>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </Tooltip>
                    )}
                </div>
                {description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                )}
            </div>
            {children}
            {isClickable && !children && (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
        </Tag>
    )
}

function EngineOption({
    selected,
    onSelect,
    icon,
    label,
    description,
    tooltip,
    children,
}: {
    selected: boolean
    onSelect: () => void
    icon: React.ReactNode
    label: string
    description: string
    tooltip?: string
    children?: React.ReactNode
}) {
    return (
        <button
            onClick={onSelect}
            className={`flex items-center gap-3 w-full px-4 py-3 text-left transition-colors ${
                selected ? 'bg-accent/60' : 'hover:bg-accent/30'
            }`}
        >
            <div className={`shrink-0 ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{label}</p>
                    {tooltip && (
                        <Tooltip text={tooltip}>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </Tooltip>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            {children}
            <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                selected ? 'border-foreground' : 'border-muted-foreground/40'
            }`}>
                {selected && <div className="h-2 w-2 rounded-full bg-foreground" />}
            </div>
        </button>
    )
}

export function SettingsView({ onSwitchProject }: SettingsViewProps) {
    const [engineMode, setEngineMode] = useState<EngineMode>('claude-code')
    const [toolsPreset, setToolsPreset] = useState<CliToolsPreset>('conservative')
    const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514')
    const [cliAvailable, setCliAvailable] = useState<{ available: boolean; error?: string } | null>(null)
    const [apiKeyInput, setApiKeyInput] = useState('')
    const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [hasApiKey, setHasApiKey] = useState(false)
    const [codexAvailable, setCodexAvailable] = useState<{ available: boolean; error?: string } | null>(null)
    const [theme, setTheme] = useState<Theme>(getStoredTheme)
    const [maxPasses, setMaxPasses] = useState(5)
    const [buildMode, setBuildMode] = useState<BuildMode>('review')
    const [commitPrefix, setCommitPrefix] = useState('feat')
    const [commitPrefixInput, setCommitPrefixInput] = useState('')
    const [sessionMode, setSessionMode] = useState<SessionMode>('per-task')
    const [notificationsEnabled, setNotificationsEnabled] = useState(true)
    const [appVersion, setAppVersion] = useState('')
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date'>('idle')
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [updateVersion, setUpdateVersion] = useState('')

    useIpcListener('updater:checking', () => setUpdateStatus('checking'), [])
    useIpcListener('updater:available', (data: unknown) => {
        const info = data as { version: string }
        setUpdateStatus('available')
        setUpdateVersion(info.version)
    }, [])
    useIpcListener('updater:not-available', () => setUpdateStatus('up-to-date'), [])
    useIpcListener('updater:progress', (data: unknown) => {
        const info = data as { percent: number }
        setUpdateStatus('downloading')
        setDownloadProgress(info.percent)
    }, [])
    useIpcListener('updater:downloaded', () => setUpdateStatus('ready'), [])
    useIpcListener('updater:error', () => setUpdateStatus('idle'), [])
    useIpcListener('menu:checkForUpdates', () => handleCheckForUpdates(), [])

    useEffect(() => {
        window.relayAPI.getEngineMode().then(setEngineMode)
        window.relayAPI.getCliToolsPreset().then(setToolsPreset)
        window.relayAPI.getSelectedModel().then(setSelectedModel)
        window.relayAPI.checkCliAvailable().then(setCliAvailable)
        window.relayAPI.getSettings().then(s => setHasApiKey(s.hasApiKey))
        window.relayAPI.checkCodexAvailable().then(setCodexAvailable)
        window.relayAPI.getMaxPasses().then(setMaxPasses)
        window.relayAPI.getBuildMode().then(setBuildMode)
        window.relayAPI.getCommitPrefix().then((p) => {
            setCommitPrefix(p)
            setCommitPrefixInput(p)
        })
        window.relayAPI.getNotificationsEnabled().then(setNotificationsEnabled)
        window.relayAPI.getSessionMode().then(setSessionMode)
        window.relayAPI.getAppInfo().then(info => setAppVersion(info.version))
    }, [])

    useEffect(() => {
        applyTheme(theme)
        localStorage.setItem('relay-theme', theme)
    }, [theme])

    const handleEngineChange = async (mode: EngineMode) => {
        setEngineMode(mode)
        await window.relayAPI.setEngineMode(mode)
        // Auto-select a valid default model for the new engine
        const defaults: Record<string, string> = {
            'codex': 'gpt-5.4',
            'claude-code': 'claude-sonnet-4-20250514',
            'api-key': 'claude-sonnet-4-20250514',
        }
        const newDefault = defaults[mode] ?? 'claude-sonnet-4-20250514'
        setSelectedModel(newDefault)
        await window.relayAPI.setSelectedModel(newDefault)
    }

    const handlePresetChange = async (preset: CliToolsPreset) => {
        setToolsPreset(preset)
        await window.relayAPI.setCliToolsPreset(preset)
    }

    const handleModelChange = async (model: string) => {
        setSelectedModel(model)
        await window.relayAPI.setSelectedModel(model)
    }

    const handleSaveApiKey = async () => {
        if (!apiKeyInput.trim()) return
        setApiKeyStatus('saving')
        const result = await window.relayAPI.setApiKey(apiKeyInput.trim())
        if (result.valid) {
            setApiKeyStatus('saved')
            setHasApiKey(true)
            setApiKeyInput('')
            setTimeout(() => setApiKeyStatus('idle'), 2000)
        } else {
            setApiKeyStatus('error')
            setTimeout(() => setApiKeyStatus('idle'), 2000)
        }
    }

    const handleMaxPassesChange = async (value: number) => {
        const clamped = Math.max(0, Math.min(20, value))
        setMaxPasses(clamped)
        await window.relayAPI.setMaxPasses(clamped)
    }

    const handleBuildModeChange = async (mode: BuildMode) => {
        setBuildMode(mode)
        await window.relayAPI.setBuildMode(mode)
    }

    const handleCommitPrefixSave = async () => {
        const trimmed = commitPrefixInput.trim() || 'feat'
        setCommitPrefix(trimmed)
        setCommitPrefixInput(trimmed)
        await window.relayAPI.setCommitPrefix(trimmed)
    }

    const handleCheckForUpdates = async () => {
        setUpdateStatus('checking')
        const result = await window.relayAPI.checkForUpdates()
        if (result) {
            setUpdateStatus('available')
            setUpdateVersion(result.version)
        } else if (updateStatus === 'checking') {
            setUpdateStatus('up-to-date')
        }
    }

    const handleNotificationsToggle = async () => {
        const next = !notificationsEnabled
        setNotificationsEnabled(next)
        await window.relayAPI.setNotificationsEnabled(next)
    }

    const handleSessionModeChange = async (mode: SessionMode) => {
        setSessionMode(mode)
        await window.relayAPI.setSessionMode(mode)
    }

    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    const toggleTheme = () => {
        setTheme(isDark ? 'light' : 'dark')
    }

    return (
        <div className="p-6 overflow-auto h-full">
            <h2 className="text-lg font-semibold mb-6">Settings</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column — General & Engine-specific */}
                <div className="space-y-6">
                    {engineMode === 'api-key' && (
                        <SettingsSection title="API Key">
                            <div className="px-4 py-3 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <p className="text-sm font-medium">
                                        {hasApiKey ? 'API Key Configured' : 'No API Key Set'}
                                    </p>
                                    {hasApiKey && <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        placeholder={hasApiKey ? '••••••••••••••••' : 'sk-ant-...'}
                                        value={apiKeyInput}
                                        onChange={(e) => setApiKeyInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                                        className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                    <button
                                        onClick={handleSaveApiKey}
                                        disabled={!apiKeyInput.trim() || apiKeyStatus === 'saving'}
                                        className="h-8 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
                                    >
                                        {apiKeyStatus === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                        {apiKeyStatus === 'saved' ? 'Saved' : hasApiKey ? 'Update' : 'Save'}
                                    </button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Encrypted and stored locally. Never leaves your machine except for API calls.
                                </p>
                            </div>
                        </SettingsSection>
                    )}

                    {engineMode === 'claude-code' && (
                        <>
                            <SettingsSection title="CLI Status">
                                <SettingsRow
                                    icon={<Terminal className="h-4 w-4" />}
                                    label={cliAvailable?.available ? 'Claude Code CLI Available' : 'Claude Code CLI Not Found'}
                                    description={
                                        cliAvailable?.available
                                            ? 'Ready to use your existing authentication'
                                            : cliAvailable?.error ?? 'Checking...'
                                    }
                                >
                                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                        cliAvailable === null ? 'bg-muted-foreground/40' : cliAvailable.available ? 'bg-green-500' : 'bg-red-500'
                                    }`} />
                                </SettingsRow>
                            </SettingsSection>

                            <SettingsSection title="Tool Permissions">
                                <EngineOption
                                    selected={toolsPreset === 'conservative'}
                                    onSelect={() => handlePresetChange('conservative')}
                                    icon={<Shield className="h-4 w-4" />}
                                    label="Conservative"
                                    description="File operations only (Read, Edit, Write, Glob, Grep)"
                                    tooltip="Safest option — the agent can only read and modify files within the project"
                                />
                                <EngineOption
                                    selected={toolsPreset === 'full'}
                                    onSelect={() => handlePresetChange('full')}
                                    icon={<Zap className="h-4 w-4" />}
                                    label="Full"
                                    description="Includes shell access (Bash, WebFetch, NotebookEdit)"
                                    tooltip="Allows the agent to run shell commands and fetch URLs — more powerful but less restricted"
                                />
                            </SettingsSection>
                        </>
                    )}

                    {engineMode === 'codex' && (
                        <SettingsSection title="CLI Status">
                            <SettingsRow
                                icon={<Terminal className="h-4 w-4" />}
                                label={codexAvailable?.available ? 'Codex CLI Available' : 'Codex CLI Not Found'}
                                description={
                                    codexAvailable?.available
                                        ? 'Ready to use your existing authentication'
                                        : codexAvailable?.error ?? 'Checking...'
                                }
                            >
                                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                    codexAvailable === null ? 'bg-muted-foreground/40' : codexAvailable.available ? 'bg-green-500' : 'bg-red-500'
                                }`} />
                            </SettingsRow>
                        </SettingsSection>
                    )}

                    <SettingsSection title="Agent Loop">
                        <EngineOption
                            selected={buildMode === 'review'}
                            onSelect={() => handleBuildModeChange('review')}
                            icon={<Pause className="h-4 w-4" />}
                            label="Pause for Review"
                            description="Pauses after each task for you to approve or reject changes"
                            tooltip="Recommended — gives you full control over what gets committed"
                        />
                        <EngineOption
                            selected={buildMode === 'auto-pilot'}
                            onSelect={() => handleBuildModeChange('auto-pilot')}
                            icon={<FastForward className="h-4 w-4" />}
                            label="Auto-Pilot"
                            description="Automatically commits and moves to the next task"
                            tooltip="Fastest mode — tasks are committed without review. Use on low-risk work."
                        />
                        <EngineOption
                            selected={buildMode === 'continuous'}
                            onSelect={() => handleBuildModeChange('continuous')}
                            icon={<Play className="h-4 w-4" />}
                            label="Continuous"
                            description="Builds all tasks without pausing, leaves changes for batch review"
                            tooltip="Tasks are built back-to-back. Changes stay uncommitted for you to review all at once."
                        />
                        <div className="px-4 py-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Max Retries per Task</span>
                                    <Tooltip text="How many times a rejected task will be re-attempted before being marked as failed. Set to 0 for unlimited.">
                                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                    </Tooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleMaxPassesChange(maxPasses - 1)}
                                        disabled={maxPasses <= 0}
                                        className="h-6 w-6 rounded flex items-center justify-center bg-muted hover:bg-accent/50 disabled:opacity-30 text-sm font-medium"
                                    >
                                        -
                                    </button>
                                    <span className="text-sm font-medium w-6 text-center">
                                        {maxPasses === 0 ? '\u221E' : maxPasses}
                                    </span>
                                    <button
                                        onClick={() => handleMaxPassesChange(maxPasses + 1)}
                                        disabled={maxPasses >= 20}
                                        className="h-6 w-6 rounded flex items-center justify-center bg-muted hover:bg-accent/50 disabled:opacity-30 text-sm font-medium"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </SettingsSection>

                    {engineMode === 'claude-code' && (
                        <SettingsSection title="Session Mode">
                            <EngineOption
                                selected={sessionMode === 'per-task'}
                                onSelect={() => handleSessionModeChange('per-task')}
                                icon={<Database className="h-4 w-4" />}
                                label="New session per task"
                                description="Fresh context for each task"
                            />
                            <EngineOption
                                selected={sessionMode === 'persistent'}
                                onSelect={() => handleSessionModeChange('persistent')}
                                icon={<Link className="h-4 w-4" />}
                                label="Persistent session (1M context)"
                                description="Keeps one session alive across all tasks. Reduces token usage."
                                tooltip="Recommended for 5x/Max plan users. Falls back to per-task if session dies."
                            />
                        </SettingsSection>
                    )}

                    <SettingsSection title="Appearance">
                        <SettingsRow
                            icon={isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                            label={isDark ? 'Dark Mode' : 'Light Mode'}
                            description="Toggle between light and dark theme"
                            onClick={toggleTheme}
                        >
                            <div className={`relative h-5 w-9 rounded-full transition-colors ${isDark ? 'bg-foreground' : 'bg-muted-foreground/30'}`}>
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                        </SettingsRow>
                    </SettingsSection>

                    <SettingsSection title="Project">
                        <SettingsRow
                            icon={<FolderSync className="h-4 w-4" />}
                            label="Switch Project"
                            description="Change the active project or create a new one"
                            onClick={onSwitchProject}
                        />
                    </SettingsSection>
                </div>

                {/* Right Column — AI Engine & Git */}
                <div className="space-y-6">
                    <SettingsSection title="Execution Engine">
                        <EngineOption
                            selected={engineMode === 'api-key'}
                            onSelect={() => handleEngineChange('api-key')}
                            icon={<Cpu className="h-4 w-4" />}
                            label="API Key"
                            description="Direct Anthropic API with your sk-ant-* key"
                            tooltip="Uses your own API key — you pay per token based on the model selected"
                        />
                        <EngineOption
                            selected={engineMode === 'claude-code'}
                            onSelect={() => handleEngineChange('claude-code')}
                            icon={<Terminal className="h-4 w-4" />}
                            label="Claude Code CLI"
                            description="Uses your existing Claude Code authentication"
                            tooltip="Requires Claude Code CLI installed and authenticated via `claude login`"
                        />
                        <EngineOption
                            selected={engineMode === 'codex'}
                            onSelect={() => handleEngineChange('codex')}
                            icon={<Braces className="h-4 w-4" />}
                            label="OpenAI Codex"
                            description="Uses your existing Codex CLI authentication"
                            tooltip="Supports GPT-5.4, GPT-5.3 Codex, and other OpenAI models"
                        />
                    </SettingsSection>

                    <SettingsSection title="Model">
                        {AVAILABLE_MODELS.filter(m => {
                            if (engineMode === 'codex') return m.engine === 'openai'
                            return m.engine === 'anthropic' || !m.engine
                        }).map((m) => (
                            <EngineOption
                                key={m.id}
                                selected={selectedModel === m.id}
                                onSelect={() => handleModelChange(m.id)}
                                icon={<Sparkles className="h-4 w-4" />}
                                label={m.label}
                                description={m.costLabel}
                            >
                                <span className={`text-[11px] font-medium uppercase tracking-wide ${tierColors[m.tier]}`}>
                                    {m.tier}
                                </span>
                            </EngineOption>
                        ))}
                    </SettingsSection>

                    <SettingsSection title="Git">
                        <div className="px-4 py-3 space-y-3">
                            <div className="flex items-center gap-1.5">
                                <GitCommitHorizontal className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Commit Prefix</span>
                                <Tooltip text="Prefix used for auto-commit messages. Example: feat(TASK-001): Add login form">
                                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                </Tooltip>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={commitPrefixInput}
                                    onChange={(e) => setCommitPrefixInput(e.target.value)}
                                    onBlur={handleCommitPrefixSave}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCommitPrefixSave()}
                                    className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                                    placeholder="feat"
                                />
                                <div className="flex items-center text-xs text-muted-foreground shrink-0">
                                    <span className="font-mono">{commitPrefix}(ID): title</span>
                                </div>
                            </div>
                        </div>
                    </SettingsSection>

                    <SettingsSection title="Notifications">
                        <SettingsRow
                            icon={notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                            label="Desktop Notifications"
                            description="Get notified when tasks need review or the build loop finishes"
                            onClick={handleNotificationsToggle}
                        >
                            <div className={`relative h-5 w-9 rounded-full transition-colors ${notificationsEnabled ? 'bg-foreground' : 'bg-muted-foreground/30'}`}>
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${notificationsEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </div>
                        </SettingsRow>
                    </SettingsSection>

                    <SettingsSection title="Data">
                        <SettingsRow
                            icon={<Database className="h-4 w-4" />}
                            label="Project Database"
                            description="Stored in .relay/relay.db inside your project folder"
                            tooltip="Each project has its own SQLite database with tasks, metrics, and logs"
                        />
                        <SettingsRow
                            icon={<Download className="h-4 w-4" />}
                            label="Export Project Data"
                            description="Export tasks and metrics as JSON from the Summary page"
                            tooltip="Navigate to the Summary page and click Export to download project data"
                        />
                    </SettingsSection>

                    <SettingsSection title="About">
                        <SettingsRow
                            icon={<Info className="h-4 w-4" />}
                            label={`Relay v${appVersion || '...'}`}
                            description="By Yoni Raviv"
                        />
                        <SettingsRow
                            icon={<Scale className="h-4 w-4" />}
                            label="License: GPL-3.0"
                            description="Free and open source software"
                        />
                    </SettingsSection>

                    <SettingsSection title="Updates">
                        <SettingsRow
                            icon={<RefreshCw className={`h-4 w-4 ${updateStatus === 'checking' ? 'animate-spin' : ''}`} />}
                            label={
                                updateStatus === 'checking' ? 'Checking for updates...' :
                                updateStatus === 'available' ? `Update v${updateVersion} Available` :
                                updateStatus === 'downloading' ? `Downloading... ${Math.round(downloadProgress)}%` :
                                updateStatus === 'ready' ? 'Update Ready' :
                                updateStatus === 'up-to-date' ? 'You\'re up to date' :
                                'Check for Updates'
                            }
                            description={
                                updateStatus === 'available' ? 'Click to download' :
                                updateStatus === 'ready' ? 'Restart to apply the update' :
                                undefined
                            }
                            onClick={
                                updateStatus === 'idle' || updateStatus === 'up-to-date' ? handleCheckForUpdates :
                                updateStatus === 'available' ? () => window.relayAPI.downloadUpdate() :
                                updateStatus === 'ready' ? () => window.relayAPI.installUpdate() :
                                undefined
                            }
                        >
                            {updateStatus === 'downloading' && (
                                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                        className="h-full bg-foreground rounded-full transition-all"
                                        style={{ width: `${downloadProgress}%` }}
                                    />
                                </div>
                            )}
                        </SettingsRow>
                    </SettingsSection>
                </div>
            </div>
        </div>
    )
}
