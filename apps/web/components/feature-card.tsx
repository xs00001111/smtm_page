import type { ReactNode } from 'react'

type FeatureCardProps = {
  title: string
  description: string
  icon?: ReactNode
}

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div className="transition duration-300 p-3 sm:p-0 flex items-start gap-3 sm:block">
      {icon && (
        <div className="shrink-0 sm:mb-4 inline-flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-gradient-to-br from-teal to-lime p-[2px] shadow-glow">
          <div className="h-full w-full rounded-[10px] bg-[#111111] grid place-items-center">
            {icon}
          </div>
        </div>
      )}
      <div className="min-w-0">
        <h3 className="font-semibold text-base sm:text-xl leading-tight">{title}</h3>
        <p className="text-muted mt-1 sm:mt-2 text-sm sm:text-base leading-relaxed line-clamp-2">
          {description}
        </p>
      </div>
    </div>
  )
}
