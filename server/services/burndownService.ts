import { BurndownDay } from '../models/types';
import { SprintRepository } from '../repositories/sprintRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';

export const BurndownService = {
  async getSprintBurndown(sprintId: string): Promise<{
    sprintId: string;
    sprintName: string;
    totalPoints: number;
    totalHours: number;
    days: BurndownDay[];
  }> {
    const sprint = await SprintRepository.findById(sprintId);
    if (!sprint) throw new Error(`Sprint ${sprintId} not found`);

    const [stories, tasks] = await Promise.all([
      StoryRepository.findAll({ projectId: sprint.projectId }),
      TaskRepository.findAll({ projectId: sprint.projectId }),
    ]);

    const sprintStories = stories.filter((s) => s.sprintId === sprint.id || s.sprint === sprint.name);
    const sprintTasks = tasks.filter((t) => t.sprintId === sprint.id || t.sprint === sprint.name);

    const totalPoints = sprintStories.reduce((acc, s) => acc + (s.storyPoints || 0), 0);
    const totalHours = sprintTasks.reduce((acc, t) => acc + (t.estimatedEffortHrs || 0), 0);

    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const now = new Date();

    const days: BurndownDay[] = [];
    const dateList: Date[] = [];
    const cur = new Date(start);

    while (cur <= end) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) {
        dateList.push(new Date(cur));
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (dateList.length === 0) {
      dateList.push(start);
    }

    const totalWorkingDays = dateList.length;

    // Completed points and hours so far
    const completedPoints = sprintStories
      .filter((s) => s.status === 'done')
      .reduce((acc, s) => acc + (s.storyPoints || 0), 0);
    const completedHours = sprintTasks
      .filter((t) => t.status === 'done')
      .reduce((acc, t) => acc + (t.estimatedEffortHrs || 0), 0);

    const remainingPointsNow = Math.max(0, totalPoints - completedPoints);
    const remainingHoursNow = Math.max(0, totalHours - completedHours);

    // Find current day index
    let currentDayIdx = 0;
    for (let i = 0; i < dateList.length; i++) {
      if (dateList[i] <= now) {
        currentDayIdx = i;
      }
    }

    dateList.forEach((d, idx) => {
      const dayFraction = idx / Math.max(1, totalWorkingDays - 1);
      const idealPoints = Math.max(0, Math.round((totalPoints * (1 - dayFraction)) * 10) / 10);
      const idealHours = Math.max(0, Math.round((totalHours * (1 - dayFraction)) * 10) / 10);

      // Historical/Simulated actual line
      let actualPoints = totalPoints;
      let actualHours = totalHours;

      if (idx <= currentDayIdx) {
        // Interpolate progress realistically up to today
        const progressFrac = currentDayIdx > 0 ? idx / currentDayIdx : 0;
        actualPoints = Math.round((totalPoints - (totalPoints - remainingPointsNow) * progressFrac) * 10) / 10;
        actualHours = Math.round((totalHours - (totalHours - remainingHoursNow) * progressFrac) * 10) / 10;
      } else {
        // Future days have no actual recorded yet
        actualPoints = remainingPointsNow;
        actualHours = remainingHoursNow;
      }

      const dateStr = d.toISOString().split('T')[0];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const label = `Day ${idx + 1} (${monthNames[d.getMonth()]} ${d.getDate()})`;

      days.push({
        dayIndex: idx + 1,
        date: dateStr,
        label,
        idealRemainingPoints: idealPoints,
        actualRemainingPoints: idx <= currentDayIdx ? actualPoints : -1, // -1 signals future day
        idealRemainingHours: idealHours,
        actualRemainingHours: idx <= currentDayIdx ? actualHours : -1,
      });
    });

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      totalPoints,
      totalHours,
      days,
    };
  },

  async calculateBurndown(sprintId: string) {
    return this.getSprintBurndown(sprintId);
  },
};
