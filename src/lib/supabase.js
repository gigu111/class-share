import { createClient } from '@supabase/supabase-js';

// .env 파일에서 Supabase 프로젝트 주소와 공개 키(Publishable Key)를 가져옵니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다.');
}

// 브라우저에서 Supabase DB, Realtime, Storage를 사용할 수 있는 클라이언트 객체입니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
