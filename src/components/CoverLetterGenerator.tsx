import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  FileText, 
  Sparkles, 
  Copy, 
  Download, 
  Save,
  Wand2,
  BookTemplate,
  Building2,
  Target
} from 'lucide-react';

interface CoverLetterTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

interface CoverLetterGeneratorProps {
  jobId?: string;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
}

export const CoverLetterGenerator: React.FC<CoverLetterGeneratorProps> = ({
  jobId,
  jobTitle = '',
  company = '',
  jobDescription = ''
}) => {
  const [templates, setTemplates] = useState<CoverLetterTemplate[]>([
    {
      id: 'professional',
      name: 'Professional',
      content: `Dear Hiring Manager,

I am writing to express my strong interest in the {{position}} position at {{company}}. With my background in {{relevant_experience}}, I am confident I would be a valuable addition to your team.

{{body_paragraph_1}}

{{body_paragraph_2}}

I am excited about the opportunity to bring my skills to {{company}} and contribute to {{company_goal}}. I would welcome the chance to discuss how my experience aligns with your needs.

Thank you for considering my application. I look forward to speaking with you.

Sincerely,
{{your_name}}`,
      variables: ['position', 'company', 'relevant_experience', 'body_paragraph_1', 'body_paragraph_2', 'company_goal', 'your_name']
    },
    {
      id: 'creative',
      name: 'Creative',
      content: `Hello {{company}} Team!

When I saw your posting for the {{position}} role, I knew I had to apply. {{opening_hook}}

{{unique_value_proposition}}

Here's what I bring to the table:
{{key_achievements}}

I'm not just looking for any job – I'm looking for a place where I can {{career_goal}}. Everything I've learned about {{company}} tells me this could be that place.

Let's chat about how we can create something amazing together!

Best regards,
{{your_name}}`,
      variables: ['company', 'position', 'opening_hook', 'unique_value_proposition', 'key_achievements', 'career_goal', 'your_name']
    }
  ]);

  const [selectedTemplate, setSelectedTemplate] = useState<string>('professional');
  const [coverLetter, setCoverLetter] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [companyInfo, setCompanyInfo] = useState('');

  const generateWithAI = async () => {
    setIsGenerating(true);
    try {
      const generatedContent = `Dear ${company} Hiring Team,

I am thrilled to apply for the ${jobTitle} position at ${company}. Your recent work on [specific project/initiative] particularly resonates with my passion for [relevant field].

With [X years] of experience in [relevant field], I have developed strong skills in [key skills from job description]. At my current role at [current company], I [specific achievement that relates to job requirements].

What excites me most about ${company} is [specific company attribute]. I believe my background in [relevant experience] would allow me to contribute meaningfully to your team's goals.

I would welcome the opportunity to discuss how my skills and enthusiasm can contribute to ${company}'s continued success.

Best regards,
[Your name]`;

      setCoverLetter(generatedContent);
    } catch (error) {
      console.error('Error generating cover letter:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const applyTemplate = () => {
    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return;

    let content = template.content;
    Object.entries(variables).forEach(([key, value]) => {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value || `[${key}]`);
    });

    setCoverLetter(content);
  };

  const downloadLetter = () => {
    const blob = new Blob([coverLetter], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cover_Letter_${company}_${jobTitle.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="text-primary" size={28} />
            Cover Letter Generator
          </h2>
          <p className="text-sm opacity-70 mt-1">
            Create tailored cover letters with AI assistance
          </p>
        </div>
      </div>

      {/* Job Context */}
      {(jobTitle || company) && (
        <div className="alert alert-info">
          <Target size={20} />
          <div>
            <p className="font-semibold">Generating for:</p>
            <p className="text-sm">{jobTitle} at {company}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Input */}
        <div className="space-y-4">
          {/* Template Selection */}
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <h3 className="font-semibold mb-3">Choose Template</h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <label key={template.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 cursor-pointer">
                    <input
                      type="radio"
                      name="template"
                      className="radio radio-primary"
                      checked={selectedTemplate === template.id}
                      onChange={() => setSelectedTemplate(template.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{template.name}</p>
                      <p className="text-xs opacity-70">
                        {template.variables.length} customizable fields
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Variable Inputs */}
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <h3 className="font-semibold mb-3">Customize Fields</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {templates.find(t => t.id === selectedTemplate)?.variables.map((variable) => (
                  <div key={variable}>
                    <label className="label">
                      <span className="label-text text-sm">
                        {variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={variables[variable] || ''}
                      onChange={(e) => setVariables({
                        ...variables,
                        [variable]: e.target.value
                      })}
                      placeholder={`Enter ${variable.replace(/_/g, ' ')}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Generate Actions */}
          <div className="flex gap-2">
            <button
              className="btn btn-primary flex-1"
              onClick={generateWithAI}
              disabled={isGenerating || !jobTitle || !company}
            >
              {isGenerating ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Generate with AI
                </>
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={applyTemplate}
            >
              <Wand2 size={20} />
              Apply Template
            </button>
          </div>
        </div>

        {/* Right Column - Output */}
        <div className="space-y-4">
          <div className="card bg-base-100 shadow-lg h-full">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Cover Letter Preview</h3>
                <div className="flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigator.clipboard.writeText(coverLetter)}
                    disabled={!coverLetter}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={downloadLetter}
                    disabled={!coverLetter}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
              
              <textarea
                className="textarea textarea-bordered w-full flex-1 min-h-[500px]"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="Your cover letter will appear here..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};