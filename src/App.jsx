import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { getDayOfWeek, getDayName, getWeekRange, getTodayDateKey, getWeekDateKey } from './hooks';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading">Loading…</div>;
  if (!session) return <LoginPage />;
  return <TrackerApp session={session} />;
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setSubmitting(false);
  };

  return (
    <div className="login-page">
      <h1>Routine Tracker</h1>
      <div className="login-card">
        <button className="google-btn" onClick={handleGoogle}>
          Continue with Google
        </button>
        <div className="divider"><span>or</span></div>
        <form onSubmit={handleEmailAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="save-btn" disabled={submitting}>
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>
        <p className="toggle-auth">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button className="link-btn" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

function TrackerApp({ session }) {
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const today = getDayOfWeek();

  useEffect(() => {
    loadData();
  }, [session.user.id]);

  const loadData = async () => {
    setDataLoading(true);
    const [{ data: tasksData }, { data: completionsData }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('completions').select('task_id, date_key'),
    ]);
    setTasks(tasksData || []);
    setCompletions(new Set((completionsData || []).map(c => `${c.task_id}_${c.date_key}`)));
    setDataLoading(false);
  };

  const addTask = async (name, frequency, specificDays) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ user_id: session.user.id, name, frequency, specific_days: specificDays || [] })
      .select()
      .single();
    if (!error) {
      setTasks(prev => [...prev, data]);
      setShowModal(false);
    }
  };

  const deleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const getDateKey = (task) =>
    task.frequency === 'weekly' ? getWeekDateKey() : getTodayDateKey();

  const toggleCompletion = async (task) => {
    const dateKey = getDateKey(task);
    const setKey = `${task.id}_${dateKey}`;
    const done = completions.has(setKey);

    if (done) {
      await supabase.from('completions').delete().eq('task_id', task.id).eq('date_key', dateKey);
      setCompletions(prev => { const next = new Set(prev); next.delete(setKey); return next; });
    } else {
      await supabase.from('completions').insert({ user_id: session.user.id, task_id: task.id, date_key: dateKey });
      setCompletions(prev => new Set(prev).add(setKey));
    }
  };

  const isCompleted = (task) => completions.has(`${task.id}_${getDateKey(task)}`);

  const canComplete = (task) => {
    if (task.frequency === 'daily') return true;
    if (task.frequency === 'weekly') return true;
    if (task.frequency === 'specific_days') return task.specific_days.includes(today);
    return false;
  };

  const getFrequencyLabel = (task) => {
    if (task.frequency === 'daily') return 'Daily';
    if (task.frequency === 'weekly') return 'Weekly';
    if (task.frequency === 'specific_days')
      return task.specific_days.slice().sort().map(d => getDayName(d)).join(', ');
    return '';
  };

  const getWeekStats = () => {
    let total = 0;
    let completed = 0;
    const now = new Date();
    const currentDay = now.getDay();

    const datePad = (n) => String(n).padStart(2, '0');
    const makeDateKey = (date) =>
      `${date.getFullYear()}-${datePad(date.getMonth() + 1)}-${datePad(date.getDate())}`;

    tasks.forEach(task => {
      if (task.frequency === 'daily') {
        total += 7;
        for (let i = 0; i <= currentDay; i++) {
          const date = new Date(now);
          date.setDate(now.getDate() - (currentDay - i));
          if (completions.has(`${task.id}_${makeDateKey(date)}`)) completed++;
        }
      } else if (task.frequency === 'specific_days') {
        total += task.specific_days.filter(d => d <= currentDay).length;
        task.specific_days.forEach(day => {
          if (day <= currentDay) {
            const date = new Date(now);
            date.setDate(now.getDate() - (currentDay - day));
            if (completions.has(`${task.id}_${makeDateKey(date)}`)) completed++;
          }
        });
      } else if (task.frequency === 'weekly') {
        total += 1;
        if (completions.has(`${task.id}_${getWeekDateKey()}`)) completed++;
      }
    });

    return { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  const handleSignOut = () => supabase.auth.signOut();

  if (dataLoading) return <div className="loading">Loading…</div>;

  const stats = getWeekStats();
  const groupedTasks = {
    daily: tasks.filter(t => t.frequency === 'daily'),
    specific_days: tasks.filter(t => t.frequency === 'specific_days'),
    weekly: tasks.filter(t => t.frequency === 'weekly'),
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Routine Tracker</h1>
        <div className="header-right">
          <span className="week-range">{getWeekRange()}</span>
          <button className="sign-out-btn" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <div className="stats">
        <div className="stats-label">
          <span>Weekly Progress</span>
          <span>{stats.completed}/{stats.total} ({stats.percentage}%)</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${stats.percentage}%` }} />
        </div>
      </div>

      <main className="main">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <p>No routines yet</p>
            <p className="empty-hint">Tap + to add your first routine</p>
          </div>
        ) : (
          <>
            {groupedTasks.daily.length > 0 && (
              <section className="task-section">
                <h2>Daily</h2>
                {groupedTasks.daily.map(task => (
                  <TaskCard key={task.id} task={task} label={getFrequencyLabel(task)}
                    completed={isCompleted(task)} canComplete={canComplete(task)}
                    onToggle={() => toggleCompletion(task)} onDelete={() => deleteTask(task.id)} />
                ))}
              </section>
            )}
            {groupedTasks.specific_days.length > 0 && (
              <section className="task-section">
                <h2>Specific Days</h2>
                {groupedTasks.specific_days.map(task => (
                  <TaskCard key={task.id} task={task} label={getFrequencyLabel(task)}
                    completed={isCompleted(task)} canComplete={canComplete(task)}
                    onToggle={() => toggleCompletion(task)} onDelete={() => deleteTask(task.id)} />
                ))}
              </section>
            )}
            {groupedTasks.weekly.length > 0 && (
              <section className="task-section">
                <h2>Weekly</h2>
                {groupedTasks.weekly.map(task => (
                  <TaskCard key={task.id} task={task} label={getFrequencyLabel(task)}
                    completed={isCompleted(task)} canComplete={canComplete(task)}
                    onToggle={() => toggleCompletion(task)} onDelete={() => deleteTask(task.id)} />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <button className="fab" onClick={() => setShowModal(true)}>+</button>

      {showModal && <AddTaskModal onSave={addTask} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function TaskCard({ task, label, completed, canComplete, onToggle, onDelete }) {
  return (
    <div className={`task-card ${completed ? 'completed' : ''} ${!canComplete ? 'disabled' : ''}`}>
      <div className="task-info" onClick={canComplete ? onToggle : undefined}>
        <div className={`checkbox ${completed ? 'checked' : ''} ${!canComplete ? 'hidden' : ''}`}>
          {completed && '✓'}
        </div>
        <div className="task-details">
          <span className="task-name">{task.name}</span>
          <span className="task-frequency">{label}</span>
        </div>
      </div>
      {!canComplete && !completed && <span className="not-today">Not today</span>}
      <button className="delete-btn" onClick={onDelete}>×</button>
    </div>
  );
}

function AddTaskModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [specificDays, setSpecificDays] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), frequency, specificDays);
  };

  const toggleDay = (day) => {
    setSpecificDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Routine</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Routine name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <div className="frequency-options">
            {['daily', 'specific_days', 'weekly'].map(f => (
              <label key={f} className={frequency === f ? 'selected' : ''}>
                <input type="radio" name="frequency" value={f}
                  checked={frequency === f} onChange={e => setFrequency(e.target.value)} />
                {f === 'daily' ? 'Daily' : f === 'weekly' ? 'Weekly' : 'Specific Days'}
              </label>
            ))}
          </div>
          {frequency === 'specific_days' && (
            <div className="days-selector">
              {[1, 2, 3, 4, 5, 6, 0].map(day => (
                <button key={day} type="button"
                  className={`day-btn ${specificDays.includes(day) ? 'selected' : ''}`}
                  onClick={() => toggleDay(day)}>
                  {getDayName(day)}
                </button>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="save-btn">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
