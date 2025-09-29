import type { ReactNode } from 'react'

type FeatureCardProps = {
  title: string
  description: string
  icon?: ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="group rounded-xl border border-white/10 p-6 bg-white/[0.02] hover:bg-white/[0.04] hover:shadow-glow transition duration-300">
      {icon && (
        <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gradient-to-br from-teal to-lime p-[2px] shadow-glow transition duration-300 group-hover:shadow-glow group-hover:scale-105">
          <div className="h-full w-full rounded-[10px] bg-[#111111] grid place-items-center">
            {icon}
          </div>
        </div>
      )}
      <h3 className="font-semibold text-xl leading-tight">{title}</h3>
      <p className="text-muted mt-2">{description}</p>
    </div>
  )
}
