import { useEffect, useMemo, useState } from 'react';
import { useSkill, useSkills } from '../hooks/useApi';
import { DetailPanel, EmptyNote, ErrorNote, ListPanel, LoadingNote, MarkdownContent, TwoPaneView } from '../components/common';
import type { SkillSummary } from '../types/api';

export function SkillsView() {
  const { data, loading, error } = useSkills();
  const [selected, setSelected] = useState<string | null>(null);

  const allSkills = useMemo<SkillSummary[]>(() => {
    if (!data) return [];
    return [...data.skills.builtIn, ...data.skills.custom];
  }, [data]);

  useEffect(() => {
    if (selected === null && allSkills.length > 0) {
      setSelected(allSkills[0].slug);
    }
  }, [allSkills, selected]);

  const { data: skillContent, loading: contentLoading, error: contentError } = useSkill(selected);

  return (
    <TwoPaneView
      list={
        <ListPanel
          title="Skills"
          loading={loading}
          error={error}
          selectedKey={selected}
          onSelect={setSelected}
          entries={allSkills.map((skill) => ({
            key: skill.slug,
            title: skill.name || skill.slug,
            subtitle: skill.phases?.join(', '),
            badge: skill.isBuiltIn ? 'built-in' : 'custom',
          }))}
        />
      }
      detail={
        <DetailPanel>
          {!selected && <EmptyNote label="Select a skill to view its content." />}
          {selected && contentLoading && <LoadingNote />}
          {selected && contentError && <ErrorNote message={contentError} />}
          {selected && skillContent && skillContent.success === false && (
            <ErrorNote message={skillContent.error || 'Skill not found'} />
          )}
          {selected && skillContent?.skill && (
            <>
              <h1>{skillContent.skill.name || skillContent.skill.slug}</h1>
              {skillContent.skill.description && <p className="muted">{skillContent.skill.description}</p>}
              {skillContent.content && <MarkdownContent content={skillContent.content} />}
            </>
          )}
        </DetailPanel>
      }
    />
  );
}
