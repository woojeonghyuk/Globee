import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ChildProfile,
} from '@/src/data/classes';
import { supabase } from '@/src/lib/supabase';
import { getCurrentGuardianConsent } from '@/src/lib/legalConsent';

type ChildProfileInput = Omit<ChildProfile, 'id'>;

type ChildRow = {
  id: string;
  full_name: string;
  age: number;
  school: string;
  interests: string[];
  note: string;
  gender: ChildProfile['gender'];
};

type ChildProfilesContextValue = {
  children: ChildProfile[];
  isLoading: boolean;
  addChild: (child: ChildProfileInput) => Promise<void>;
  updateChild: (id: string, child: ChildProfileInput) => Promise<void>;
  deleteChild: (id: string) => Promise<void>;
  refreshChildren: () => Promise<void>;
};

const ChildProfilesContext = createContext<ChildProfilesContextValue | null>(null);

type ChildProfilesProviderProps = {
  children: ReactNode;
};

function uniqueChildProfiles(children: ChildProfile[]) {
  const seenIds = new Set<string>();

  return children.filter((child) => {
    if (seenIds.has(child.id)) {
      return false;
    }

    seenIds.add(child.id);
    return true;
  });
}

export function ChildProfilesProvider({ children }: ChildProfilesProviderProps) {
  const [profiles, setProfiles] = useState<ChildProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const mapChildRow = (row: ChildRow): ChildProfile => ({
    id: row.id,
    fullName: row.full_name,
    age: row.age,
    school: row.school,
    interests: row.interests,
    note: row.note,
    gender: row.gender,
  });

  const refreshChildren = useCallback(async () => {
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setProfiles([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('children')
        .select('id,full_name,age,school,interests,note,gender')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setProfiles(uniqueChildProfiles((data as ChildRow[]).map(mapChildRow)));
      }
    } catch {
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshChildren();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        refreshChildren();
      }

      if (event === 'SIGNED_OUT') {
        setProfiles([]);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshChildren]);

  const value = useMemo<ChildProfilesContextValue>(
    () => ({
      children: profiles,
      isLoading,
      refreshChildren,
      addChild: async (child) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setProfiles((prev) => [
            { ...child, id: `child-${Date.now()}` },
            ...prev,
          ]);
          return;
        }

        const consent = await getCurrentGuardianConsent(user.id);
        if (!consent) {
          throw new Error('아이 등록 전에 보호자 동의를 완료해주세요.');
        }

        const { data, error } = await supabase
          .from('children')
          .insert({
            parent_id: user.id,
            full_name: child.fullName,
            age: child.age,
            school: child.school,
            interests: child.interests,
            note: child.note,
            gender: child.gender,
          })
          .select('id,full_name,age,school,interests,note,gender')
          .single();

        if (error) throw error;

        const nextChild = mapChildRow(data as ChildRow);

        setProfiles((prev) => [
          nextChild,
          ...prev.filter((profile) => profile.id !== nextChild.id),
        ]);
      },
      updateChild: async (id, child) => {
        const { data, error } = await supabase
          .from('children')
          .update({
            full_name: child.fullName,
            age: child.age,
            school: child.school,
            interests: child.interests,
            note: child.note,
            gender: child.gender,
          })
          .eq('id', id)
          .select('id,full_name,age,school,interests,note,gender')
          .single();

        if (error) {
          throw error;
        }

        setProfiles((prev) =>
          prev.map((profile) =>
            profile.id === id ? mapChildRow(data as ChildRow) : profile,
          ),
        );
      },
      deleteChild: async (id) => {
        const { error } = await supabase.from('children').delete().eq('id', id);
        if (error) throw error;

        setProfiles((prev) => prev.filter((profile) => profile.id !== id));
      },
    }),
    [isLoading, profiles, refreshChildren],
  );

  return (
    <ChildProfilesContext.Provider value={value}>
      {children}
    </ChildProfilesContext.Provider>
  );
}

export function useChildProfiles() {
  const value = useContext(ChildProfilesContext);

  if (!value) {
    throw new Error('useChildProfiles must be used within ChildProfilesProvider');
  }

  return value;
}
