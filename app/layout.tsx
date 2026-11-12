import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Дента — клиника',description:'Расписание, пациенты и планы лечения. Закрытая тестовая версия.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
