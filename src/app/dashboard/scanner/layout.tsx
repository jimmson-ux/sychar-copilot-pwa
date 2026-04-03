import ScannerSidebar from '@/components/ScannerSidebar'

export default function ScannerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <ScannerSidebar />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
