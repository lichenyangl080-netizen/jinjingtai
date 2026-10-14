type ScopeMaterial = {
  cwd: string;
  project?: { id?: string; name?: string; workspace?: string };
};

export function scopeProjects<T extends ScopeMaterial>(materials: T[]) {
  const groups = new Map<
    string,
    { key: string; name: string; materials: T[]; directories: string[] }
  >();
  for (const material of materials) {
    const key = material.project?.id || material.cwd;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: material.project?.name || "待归属项目",
        materials: [],
        directories: [],
      };
      groups.set(key, group);
    }
    group.materials.push(material);
    const directory = material.project?.workspace || material.cwd;
    if (directory && !group.directories.includes(directory))
      group.directories.push(directory);
  }
  const names = new Map<string, number>();
  for (const group of groups.values())
    names.set(group.name, (names.get(group.name) || 0) + 1);
  return [...groups.values()].map((group) => ({
    ...group,
    sameName: names.get(group.name)! > 1,
  }));
}
