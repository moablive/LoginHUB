import { Outlet } from 'react-router-dom';

export const AdminLayout = () => {
  return (
    <div className="min-h-screen min-h-dvh bg-background text-foreground flex flex-col transition-colors duration-200">
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
};
