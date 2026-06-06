import { useState } from 'react';
import { useLocalStorage, generateId, getTodayKey, getWeekKey, getDayOfWeek, getDayName, getWeekRange } from './hooks';
import './App.css';

function App() {
  const [tasks, setTasks] = useLocalStorage('routine-tracker-tasks', []);
  const [completions, setCompletions] = useLocalStorage('routine-tracker-completions', {});
  const [showModal, setShowModal] = useState(false);
  
  const today = getDayOfWeek();
  const todayKey = getTodayKey('');
  const weekKey = getWeekKey('');

  const addTask = (name, frequency, specificDays) => {
    const newTask = {
      id: generateId(),
      name,
      frequency,
      specificDays: specificDays || [],
      createdAt: new Date().toISOString(),
    };
    setTasks([...tasks, newTask]);
    setShowModal(false);
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const toggleCompletion = (task) => {
    const today = new Date();
    const key = task.frequency === 'weekly' 
      ? getWeekKey(task.id)
      : getTodayKey(task.id);
    
    setCompletions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isCompleted = (task) => {
    const key = task.frequency === 'weekly'
      ? getWeekKey(task.id)
      : getTodayKey(task.id);
    return completions[key];
  };

  const canComplete = (task) => {
    if (task.frequency === 'daily') return true;
    if (task.frequency === 'weekly') return true;
    if (task.frequency === 'specific_days') {
      return task.specificDays.includes(today);
    }
    return false;
  };

  const getFrequencyLabel = (task) => {
    if (task.frequency === 'daily') return 'Daily';
    if (task.frequency === 'weekly') return 'Weekly';
    if (task.frequency === 'specific_days') {
      return task.specificDays.sort().map(d => getDayName(d)).join(', ');
    }
    return '';
  };

  const getWeekStats = () => {
    let total = 0;
    let completed = 0;
    const now = new Date();
    const currentDay = now.getDay();
    
    tasks.forEach(task => {
      if (task.frequency === 'daily') {
        total += 7;
        for (let i = 0; i <= currentDay; i++) {
          const date = new Date(now);
          date.setDate(now.getDate() - (currentDay - i));
          const key = `${task.id}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          if (completions[key]) completed++;
        }
      } else if (task.frequency === 'specific_days') {
        total += task.specificDays.filter(d => d <= currentDay).length;
        task.specificDays.forEach(day => {
          if (day <= currentDay) {
            const date = new Date(now);
            const diff = currentDay - day;
            date.setDate(now.getDate() - diff);
            const key = `${task.id}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            if (completions[key]) completed++;
          }
        });
      } else if (task.frequency === 'weekly') {
        total += 1;
        const key = getWeekKey(task.id);
        if (completions[key]) completed++;
      }
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  };

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
        <span className="week-range">{getWeekRange()}</span>
      </header>

      <div className="stats">
        <div className="stats-label">
          <span>Weekly Progress</span>
          <span>{stats.completed}/{stats.total} ({stats.percentage}%)</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${stats.percentage}%` }}
          />
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
                  <TaskCard
                    key={task.id}
                    task={task}
                    label={getFrequencyLabel(task)}
                    completed={isCompleted(task)}
                    canComplete={canComplete(task)}
                    onToggle={() => toggleCompletion(task)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </section>
            )}

            {groupedTasks.specific_days.length > 0 && (
              <section className="task-section">
                <h2>Specific Days</h2>
                {groupedTasks.specific_days.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    label={getFrequencyLabel(task)}
                    completed={isCompleted(task)}
                    canComplete={canComplete(task)}
                    onToggle={() => toggleCompletion(task)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </section>
            )}

            {groupedTasks.weekly.length > 0 && (
              <section className="task-section">
                <h2>Weekly</h2>
                {groupedTasks.weekly.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    label={getFrequencyLabel(task)}
                    completed={isCompleted(task)}
                    canComplete={canComplete(task)}
                    onToggle={() => toggleCompletion(task)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <button className="fab" onClick={() => setShowModal(true)}>
        +
      </button>

      {showModal && (
        <AddTaskModal
          onSave={addTask}
          onClose={() => setShowModal(false)}
        />
      )}
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
      {!canComplete && !completed && (
        <span className="not-today">Not today</span>
      )}
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
    setSpecificDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
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
            <label className={frequency === 'daily' ? 'selected' : ''}>
              <input
                type="radio"
                name="frequency"
                value="daily"
                checked={frequency === 'daily'}
                onChange={e => setFrequency(e.target.value)}
              />
              Daily
            </label>
            <label className={frequency === 'specific_days' ? 'selected' : ''}>
              <input
                type="radio"
                name="frequency"
                value="specific_days"
                checked={frequency === 'specific_days'}
                onChange={e => setFrequency(e.target.value)}
              />
              Specific Days
            </label>
            <label className={frequency === 'weekly' ? 'selected' : ''}>
              <input
                type="radio"
                name="frequency"
                value="weekly"
                checked={frequency === 'weekly'}
                onChange={e => setFrequency(e.target.value)}
              />
              Weekly
            </label>
          </div>

          {frequency === 'specific_days' && (
            <div className="days-selector">
              {[1, 2, 3, 4, 5, 6, 0].map(day => (
                <button
                  key={day}
                  type="button"
                  className={`day-btn ${specificDays.includes(day) ? 'selected' : ''}`}
                  onClick={() => toggleDay(day)}
                >
                  {getDayName(day)}
                </button>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
