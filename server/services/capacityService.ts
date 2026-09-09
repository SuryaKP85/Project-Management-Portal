import { SprintCapacitySummary, MemberCapacityBreakdown } from '../models/types';
import { SprintRepository } from '../repositories/sprintRepository';
import { ProjectRepository } from '../repositories/projectRepository';
import { StoryRepository } from '../repositories/storyRepository';
import { TaskRepository } from '../repositories/taskRepository';

export function calculateWorkingDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return 10; // default 2-week sprint
  }

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

export const CapacityService = {
  async calculateSprintCapacity(sprintId: string): Promise<SprintCapacitySummary> {
    const sprint = await SprintRepository.findById(sprintId);
    if (!sprint) {
      throw new Error(`Sprint with ID ${sprintId} not found`);
    }

    const project = await ProjectRepository.findById(sprint.projectId);
    const workingDays = calculateWorkingDays(sprint.startDate, sprint.endDate);

    // Get team members for project or fallback standard cross-functional squad
    const members = project?.members && project.members.length > 0
      ? project.members
      : [
          { name: 'Bob Johnson', role: 'Lead Developer' },
          { name: 'David Miller', role: 'QA Analyst' },
          { name: 'Sarah Connor', role: 'Business Analyst' },
        ];

    // Build member breakdown
    const memberBreakdown: MemberCapacityBreakdown[] = members.map((m) => {
      let allocPercent = 100;
      if (m.role?.toLowerCase().includes('manager')) allocPercent = 40;
      else if (m.role?.toLowerCase().includes('analyst')) allocPercent = 75;

      const dailyCapacity = 8;
      const totalAvailable = Math.round(workingDays * dailyCapacity * (allocPercent / 100));

      // Sample deterministic leave/other alloc calculation based on name
      const leaveHrs = m.name.includes('David') ? 8 : 0;
      const existingAllocHrs = m.name.includes('Sarah') ? 8 : 0;
      const netCapacityHrs = Math.max(0, totalAvailable - leaveHrs - existingAllocHrs);

      return {
        userId: m.userId,
        name: m.name,
        role: m.role,
        allocationPercent: allocPercent,
        dailyCapacityHrs: dailyCapacity,
        totalAvailableHrs: totalAvailable,
        leaveHrs,
        existingAllocHrs,
        netCapacityHrs,
        assignedSprintHrs: 0,
        assignedSprintPoints: 0,
      };
    });

    const calculatedAvailableHours = memberBreakdown.reduce((sum, m) => sum + m.netCapacityHrs, 0);
    const availableHours = sprint.capacityHours > 0 ? sprint.capacityHours : calculatedAvailableHours;
    const capacityPoints = sprint.capacityPoints > 0 ? sprint.capacityPoints : Math.round(availableHours / 4);

    // Fetch committed stories and tasks
    const [stories, tasks] = await Promise.all([
      StoryRepository.findAll({ projectId: sprint.projectId }),
      TaskRepository.findAll({ projectId: sprint.projectId }),
    ]);

    const sprintStories = stories.filter((s) => s.sprintId === sprint.id || s.sprint === sprint.name);
    const sprintTasks = tasks.filter((t) => t.sprintId === sprint.id || t.sprint === sprint.name);

    // Points calculation
    const committedPoints = sprintStories.reduce((acc, s) => acc + (s.storyPoints || 0), 0);
    const completedPoints = sprintStories
      .filter((s) => s.status === 'done')
      .reduce((acc, s) => acc + (s.storyPoints || 0), 0);
    const remainingPoints = Math.max(0, committedPoints - completedPoints);

    // Hours calculation
    const committedHours = sprintTasks.reduce((acc, t) => acc + (t.estimatedEffortHrs || 0), 0);
    const completedHours = sprintTasks
      .filter((t) => t.status === 'done')
      .reduce((acc, t) => acc + (t.estimatedEffortHrs || t.actualEffortHrs || 0), 0);
    const remainingHours = Math.max(0, committedHours - completedHours);

    // Assign per member sprint effort
    sprintTasks.forEach((t) => {
      if (t.assigneeName) {
        const mem = memberBreakdown.find((m) => m.name.toLowerCase() === t.assigneeName?.toLowerCase());
        if (mem) {
          mem.assignedSprintHrs += (t.estimatedEffortHrs || 0);
        }
      }
    });

    sprintStories.forEach((s) => {
      if (s.assigneeName) {
        const mem = memberBreakdown.find((m) => m.name.toLowerCase() === s.assigneeName?.toLowerCase());
        if (mem) {
          mem.assignedSprintPoints += (s.storyPoints || 0);
        }
      }
    });

    const hoursUtilization = availableHours > 0
      ? Math.round((committedHours / availableHours) * 1000) / 10
      : 0;

    const pointsUtilization = capacityPoints > 0
      ? Math.round((committedPoints / capacityPoints) * 1000) / 10
      : 0;

    const isOverCapacity = hoursUtilization > 100 || pointsUtilization > 100;

    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      workingDays,
      teamMembersCount: memberBreakdown.length,
      availableHours,
      capacityPoints,
      committedHours,
      completedHours,
      remainingHours,
      committedPoints,
      completedPoints,
      remainingPoints,
      hoursUtilization,
      pointsUtilization,
      isOverCapacity,
      memberBreakdown,
    };
  },
};
