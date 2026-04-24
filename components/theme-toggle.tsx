"use client"

import * as React from "react"
import { Check, Palette } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type PaletteId = "mono" | "golden" | "blue" | "crimson"
type AppearanceId = "light" | "dark" | "blue" | "crimson" | "golden"

const APPEARANCES: Array<{ id: AppearanceId; label: string; theme: "light" | "dark"; palette: PaletteId }> = [
  { id: "light", label: "Light", theme: "light", palette: "mono" },
  { id: "dark", label: "Dark", theme: "dark", palette: "mono" },
  { id: "blue", label: "Blue", theme: "dark", palette: "blue" },
  { id: "crimson", label: "Crimson", theme: "dark", palette: "crimson" },
  { id: "golden", label: "Golden", theme: "light", palette: "golden" },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [appearance, setAppearance] = React.useState<AppearanceId>("dark")

  React.useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("twinmind_appearance") as AppearanceId | null

    if (saved && APPEARANCES.some((item) => item.id === saved)) {
      applyAppearance(saved, setTheme)
      setAppearance(saved)
      return
    }

    const palette = (localStorage.getItem("twinmind_palette") as PaletteId | null) || "mono"
    const inferred = inferAppearance(resolvedTheme === "light" ? "light" : "dark", palette)
    applyAppearance(inferred, setTheme)
    setAppearance(inferred)
  }, [])

  React.useEffect(() => {
    if (!mounted) return
    const palette = (localStorage.getItem("twinmind_palette") as PaletteId | null) || "mono"
    const next = inferAppearance(resolvedTheme === "light" ? "light" : "dark", palette)
    setAppearance(next)
  }, [resolvedTheme, mounted])

  const setAppearanceMode = (next: AppearanceId) => {
    applyAppearance(next, setTheme)
    setAppearance(next)
  }

  if (!mounted) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className={className} aria-label="Change appearance">
          <div className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Change appearance" className={className}>
            <Palette className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {APPEARANCES.map((item) => (
            <DropdownMenuItem key={item.id} onClick={() => setAppearanceMode(item.id)}>
              {appearance === item.id ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function inferAppearance(theme: "light" | "dark", palette: PaletteId): AppearanceId {
  if (palette === "golden") return "golden"
  if (palette === "blue") return "blue"
  if (palette === "crimson") return "crimson"
  return theme === "light" ? "light" : "dark"
}

function applyAppearance(next: AppearanceId, setTheme: (theme: string) => void) {
  const picked = APPEARANCES.find((item) => item.id === next) || APPEARANCES[1]
  document.documentElement.dataset.palette = picked.palette
  setTheme(picked.theme)
  localStorage.setItem("twinmind_palette", picked.palette)
  localStorage.setItem("twinmind_appearance", picked.id)
}
