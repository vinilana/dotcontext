import { useEffect, useMemo, useState } from 'react';
import { useSkill, useSkills } from '../hooks/useApi';
import {
  CopyButton,
  DetailPanel,
  DownloadButton,
  EmptyNote,
  ErrorNote,
  ListPanel,
  LoadingNote,
  MarkdownContent,
  PageHeader,
  TwoPaneView,
} from '../components/common';
import { withFrontMatter } from '../lib/markdown';
import type { SkillSummary } from '../types/api';

export function SkillsView() {
  const { data, loading, error } = useSkills();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allSkills;
    return allSkills.filter(
      (skill) =>
        (skill.name || skill.slug).toLowerCase().includes(q) ||
        skill.slug.toLowerCase().includes(q) ||
        skill.description?.toLowerCase().includes(q)
    );
  }, [allSkills, query]);

  const fileContent =
    skillContent?.skill && skillContent.content
      ? withFrontMatter(
          {
            name: skillContent.skill.name,
            description: skillContent.skill.description,
            phases: skillContent.skill.phases,
          },
          skillContent.content
        )
      : '';

  return (
    <TwoPaneView
      list={
        <ListPanel
          title="Skills"
          loading={loading}
          error={error}
          selectedKey={selected}
          onSelect={setSelected}
          search={{ value: query, onChange: setQuery, placeholder: 'Search skills…' }}
          entries={filtered.map((skill) => ({
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
              <PageHeader
                title={skillContent.skill.name || skillContent.skill.slug}
                subtitle={skillContent.skill.description}
                actions={
                  fileContent && (
                    <>
                      <CopyButton text={fileContent} label="Copy" />
                      <DownloadButton content={fileContent} filename={`${skillContent.skill.slug}.SKILL.md`} label="Download" />
                    </>
                  )
                }
              />
              {skillContent.skill.phases && skillContent.skill.phases.length > 0 && (
                <div className="tag-row">
                  {skillContent.skill.phases.map((phase) => (
                    <span key={phase} className="tag">
                      {phase}
                    </span>
                  ))}
                </div>
              )}
              {skillContent.content && <MarkdownContent content={skillContent.content} />}
            </>
          )}
        </DetailPanel>
      }
    />
  );
}
