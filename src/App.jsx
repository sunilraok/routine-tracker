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
  const [view, setView] = useState('routines');

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
        <div className="header-top">
          <h1>Routine Tracker</h1>
          <div className="user-info">
            <span className="user-name">
              {session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email}
            </span>
            <button className="sign-out-btn" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
        <span className="week-range">{getWeekRange()}</span>
      </header>

      <div className="tab-nav">
        <button className={`tab ${view === 'routines' ? 'active' : ''}`} onClick={() => setView('routines')}>Routines</button>
        <button className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
      </div>

      {view === 'routines' && (
        <>
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
        </>
      )}

      {view === 'dashboard' && <Dashboard tasks={tasks} />}
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

function Dashboard({ tasks }) {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [allCompletions, setAllCompletions] = useState({});

  const pad = (n) => String(n).padStart(2, '0');

  useEffect(() => {
    supabase.from('completions').select('task_id, date_key').then(({ data }) => {
      const byDate = {};
      (data || []).forEach(c => {
        if (!byDate[c.date_key]) byDate[c.date_key] = new Set();
        byDate[c.date_key].add(c.task_id);
      });
      setAllCompletions(byDate);
    });
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isCurrentMonth = currentMonth.getFullYear() === now.getFullYear() &&
    currentMonth.getMonth() === now.getMonth();

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
    return days;
  };

  const generateMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  };

  const getMonthWeeks = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const getMondayInfo = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      d.setHours(0, 0, 0, 0);
      return { key: `week_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, monday: new Date(d) };
    };
    const weeks = [];
    const seen = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const { key, monday } = getMondayInfo(new Date(year, month, d));
      if (!seen.has(key)) { seen.add(key); weeks.push({ key, monday }); }
    }
    return weeks;
  };

  const getOverallDayStats = (date) => {
    const dayOfWeek = date.getDay();
    const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const expected = tasks.filter(t =>
      t.frequency === 'daily' ||
      (t.frequency === 'specific_days' && t.specific_days.includes(dayOfWeek))
    );
    if (expected.length === 0) return { expected: 0, completed: 0, percentage: null };
    const completedSet = allCompletions[dateKey] || new Set();
    const completed = expected.filter(t => completedSet.has(t.id)).length;
    return { expected: expected.length, completed, percentage: Math.round((completed / expected.length) * 100) };
  };

  const getOverallCellClass = (date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (d > today) return 'future';
    const { percentage } = getOverallDayStats(date);
    if (percentage === null) return 'no-tasks';
    if (percentage === 0) return 'zero';
    if (percentage < 50) return 'low';
    if (percentage < 100) return 'medium';
    return 'full';
  };

  const isToday = (date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const calendarDays = generateCalendarDays();
  const monthDays = generateMonthDays();
  const monthWeeks = getMonthWeeks();
  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="dashboard">
      <div className="calendar-nav">
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>‹</button>
        <span>{monthLabel}</span>
        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} disabled={isCurrentMonth}>›</button>
      </div>

      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="calendar-day-name">{d}</div>
        ))}
        {calendarDays.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="calendar-cell empty" />;
          const stats = getOverallDayStats(date);
          return (
            <div
              key={date.toISOString()}
              className={`calendar-cell ${getOverallCellClass(date)} ${isToday(date) ? 'today' : ''}`}
              title={stats.expected > 0 ? `${stats.completed}/${stats.expected} completed` : ''}
            >
              <span className="day-number">{date.getDate()}</span>
            </div>
          );
        })}
      </div>

      <div className="legend">
        <span className="legend-label">Less</span>
        <div className="legend-dot zero" />
        <div className="legend-dot low" />
        <div className="legend-dot medium" />
        <div className="legend-dot full" />
        <span className="legend-label">More</span>
      </div>

      {tasks.length > 0 && (
        <div className="routine-rows">
          <h3 className="routine-rows-title">By Routine</h3>
          {tasks.map(task => (
            <RoutineRow
              key={task.id}
              task={task}
              monthDays={monthDays}
              monthWeeks={monthWeeks}
              allCompletions={allCompletions}
              today={today}
              pad={pad}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoutineRow({ task, monthDays, monthWeeks, allCompletions, today, pad }) {
  const isWeekly = task.frequency === 'weekly';

  const getDayStatus = (date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (d > today) return 'future';
    const isExpected = task.frequency === 'daily' ||
      (task.frequency === 'specific_days' && task.specific_days.includes(date.getDay()));
    if (!isExpected) return 'not-expected';
    const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return (allCompletions[dateKey] || new Set()).has(task.id) ? 'done' : 'missed';
  };

  const getWeekStatus = ({ key, monday }) => {
    const m = new Date(monday); m.setHours(0, 0, 0, 0);
    if (m > today) return 'future';
    return (allCompletions[key] || new Set()).has(task.id) ? 'done' : 'missed';
  };

  let expected = 0, completed = 0;
  if (isWeekly) {
    monthWeeks.forEach(w => {
      const m = new Date(w.monday); m.setHours(0, 0, 0, 0);
      if (m <= today) {
        expected++;
        if ((allCompletions[w.key] || new Set()).has(task.id)) completed++;
      }
    });
  } else {
    monthDays.forEach(date => {
      const d = new Date(date); d.setHours(0, 0, 0, 0);
      if (d <= today) {
        const isExpected = task.frequency === 'daily' ||
          (task.frequency === 'specific_days' && task.specific_days.includes(date.getDay()));
        if (isExpected) {
          expected++;
          const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
          if ((allCompletions[dateKey] || new Set()).has(task.id)) completed++;
        }
      }
    });
  }
  const pct = expected > 0 ? Math.round((completed / expected) * 100) : null;

  return (
    <div className="routine-row">
      <div className="routine-row-header">
        <span className="routine-row-name">{task.name}</span>
        {pct !== null && <span className="routine-row-pct">{pct}%</span>}
      </div>
      <div className="routine-row-squares">
        {isWeekly
          ? monthWeeks.map(w => <div key={w.key} className={`routine-square ${getWeekStatus(w)}`} />)
          : monthDays.map(date => <div key={date.toISOString()} className={`routine-square ${getDayStatus(date)}`} />)
        }
      </div>
    </div>
  );
}

export default App;
