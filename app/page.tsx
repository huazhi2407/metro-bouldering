import MetroMap from '@/components/MetroMap';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-gray-800">
            台北捷運攀岩場地圖
          </h1>
          <p className="text-gray-600 mt-2">
            點擊捷運站查看附近的攀岩場資訊
          </p>
        </div>
      </header>
      <main>
        <MetroMap />
      </main>
    </div>
  );
}
