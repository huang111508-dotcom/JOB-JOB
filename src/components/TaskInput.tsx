import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

interface TaskInputProps {
  onParse: (text: string) => Promise<void>;
  isLoading: boolean;
}

export const TaskInput: React.FC<TaskInputProps> = ({ onParse, isLoading }) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const textToSubmit = inputText;
    setInputText('');
    await onParse(textToSubmit);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          rows={3}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="请输入任务自然语言指令（例如：“10月排班，截止9.25” 或 “9186 已完成”），支持多行批量输入，快捷键 Ctrl+Enter 提交"
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-100"
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在处理...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                提交
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
