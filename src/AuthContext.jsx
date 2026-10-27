import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const [session, setSession] = useState(null);
	const [profile, setProfile] = useState(null);
	const [loading, setLoading] = useState(true);
	const [recovering, setRecovering] = useState(false);

	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session);
			setLoading(false);
		});
		const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
			setSession(s);
			if (event === 'PASSWORD_RECOVERY') setRecovering(true);
			if (event === 'SIGNED_OUT') setProfile(null);
		});
		return () => sub.subscription.unsubscribe();
	}, []);

	useEffect(() => {
		if (!session?.user) return;
		supabase
			.from('profiles')
			.select('*')
			.eq('id', session.user.id)
			.single()
			.then(({ data }) => setProfile(data));
	}, [session?.user?.id]);

	const value = {
		session,
		user: session?.user ?? null,
		profile,
		loading,
		recovering,
		clearRecovering: () => setRecovering(false),
		signOut: () => supabase.auth.signOut(),
	};
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
